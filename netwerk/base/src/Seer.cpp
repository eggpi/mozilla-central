/* vim: set ts=2 sts=2 et sw=2: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>

#include "Seer.h"

#include "nsAppDirectoryServiceDefs.h"
#include "nsICancelable.h"
#include "nsIDNSListener.h"
#include "nsIDNSService.h"
#include "nsIFile.h"
#include "nsILoadContext.h"
#include "nsIObserverService.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsServiceManagerUtils.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

#include "mozIStorageConnection.h"
#include "mozIStorageService.h"
#include "mozIStorageStatement.h"
#include "mozStorageHelper.h"

#include "mozilla/storage.h"

using namespace mozilla::storage;

namespace mozilla {
namespace net {

#define RETURN_IF_FAILED(_rv) \
  do { \
    if (NS_FAILED(_rv)) { \
      return; \
    } \
  } while (0)

const char SEER_ENABLED_PREF[] = "network.seer.enabled";

const int PRECONNECT_MIN = 90;
const int PRERESOLVE_MIN = 60;
const int REDIRECT_LIKELY = 75;

const long long ONE_DAY = 86400LL * 1000000LL;
const long long ONE_WEEK = 7LL * ONE_DAY;
const long long ONE_MONTH = 30LL * ONE_DAY;
const long long ONE_YEAR = 365LL * ONE_DAY;

const long STARTUP_WINDOW = 5L * 60L * 1000000L; // 5min

// Preference observer for the seer

class SeerObserver : public nsIObserver
{
public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOBSERVER

  SeerObserver()
  { }

  virtual ~SeerObserver() { }

  nsresult Install();
  void Remove();
  bool IsEnabled() { return mEnabled; }

private:
  bool mEnabled;
};

NS_IMPL_ISUPPORTS1(SeerObserver, nsIObserver)

nsresult
SeerObserver::Install()
{
  nsresult rv = NS_OK;
  nsCOMPtr<nsIObserverService> obs =
    mozilla::services::GetObserverService();
  if (obs) {
    rv = obs->AddObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID,
        false);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIPrefBranch> prefs = do_GetService(NS_PREFSERVICE_CONTRACTID);
  if (prefs) {
    rv = prefs->AddObserver(SEER_ENABLED_PREF, this, false);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = prefs->GetBoolPref(SEER_ENABLED_PREF, &mEnabled);
  }

  return rv;
}

void
SeerObserver::Remove()
{
  nsCOMPtr<nsIObserverService> obs =
    mozilla::services::GetObserverService();
  if (obs) {
    obs->RemoveObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID);
  }

  nsCOMPtr<nsIPrefBranch> prefs = do_GetService(NS_PREFSERVICE_CONTRACTID);
  if (prefs) {
    prefs->RemoveObserver(SEER_ENABLED_PREF, this);
  }
}

NS_IMETHODIMP
SeerObserver::Observe(nsISupports *subject, const char *topic,
    const PRUnichar *data_unicode)
{
  if (!strcmp(NS_XPCOM_SHUTDOWN_OBSERVER_ID, topic)) {
    Seer::gSeer->Shutdown();
  } else if (!strcmp(NS_PREFBRANCH_PREFCHANGE_TOPIC_ID, topic)) {
    nsresult rv;
    nsCOMPtr<nsIPrefBranch> branch = do_QueryInterface(subject, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    NS_ConvertUTF16toUTF8 data(data_unicode);

    if (!strcmp(SEER_ENABLED_PREF, data.get())) {
      rv = branch->GetBoolPref(SEER_ENABLED_PREF, &mEnabled);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  return NS_OK;
}

// Listener for the speculative DNS requests we'll fire off, which just ignores
// the result (since we're just trying to warn the cache)

class SeerDNSListener : public nsIDNSListener
{
public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDNSLISTENER

  SeerDNSListener()
  { }

  virtual ~SeerDNSListener() { }
};

NS_IMPL_ISUPPORTS1(SeerDNSListener, nsIDNSListener)

NS_IMETHODIMP
SeerDNSListener::OnLookupComplete(nsICancelable *request,
    nsIDNSRecord *rec, nsresult status)
{
  return NS_OK;
}

// Are you ready for the fun part? Because here comes the fun part. The seer,
// which will do awesome stuff as you browse to make your browsing experience
// faster.

Seer *Seer::gSeer = nullptr;

NS_IMPL_ISUPPORTS1(Seer, nsINetworkSeer)

Seer::Seer()
  :mInitialized(false)
  ,mStatements(mDB)
  ,mLastStartupTime(0)
  ,mStartupCount(0)
{
  MOZ_ASSERT(!gSeer, "multiple Seer instances!");
  gSeer = this;
  mStartupTime = PR_Now();
}

Seer::~Seer()
{
  if (mInitialized)
    Shutdown();

  if (mObserver) {
    mObserver->Remove();
  }

  gSeer = nullptr;
}

nsresult
Seer::Init()
{
  if (!NS_IsMainThread()) {
    MOZ_ASSERT(false, "Seer::Init called off the main thread!");
    return NS_ERROR_UNEXPECTED;
  }

  nsresult rv = NS_OK;

  if (!mObserver) {
    mObserver = new SeerObserver();
    rv = mObserver->Install();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (!mListener) {
    mListener = new SeerDNSListener();
  }

  rv = NS_NewNamedThread("Seer Thread", getter_AddRefs(mIOThread));
  NS_ENSURE_SUCCESS(rv, rv);

  mSpeculativeService = do_GetService("@mozilla.org/network/io-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  mDnsService = do_GetService("@mozilla.org/network/dns-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  mStorageService = do_GetService("@mozilla.org/storage/service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
      getter_AddRefs(mDBFile));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDBFile->AppendNative(NS_LITERAL_CSTRING("seer.sqlite"));
  NS_ENSURE_SUCCESS(rv, rv);

  mInitialized = true;

  return rv;
}

// Make sure that our sqlite storage is all set up with all the tables we need
// to do the work. It isn't the end of the world if this fails, since this is
// all an optimization, anyway.

nsresult
Seer::EnsureInitStorage()
{
  if (mDB) {
    return NS_OK;
  }

  nsresult rv;

  rv = mStorageService->OpenDatabase(mDBFile, getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);

  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("PRAGMA synchronous = OFF;"));

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_hosts (\n"
                         "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
                         "  origin TEXT NOT NULL,\n"
                         "  loads INTEGER DEFAULT 0,\n"
                         "  last_load INTEGER DEFAULT 0\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_subhosts (\n"
                         "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
                         "  hid INTEGER NOT NULL,\n"
                         "  origin TEXT NOT NULL,\n"
                         "  hits INTEGER DEFAULT 0,\n"
                         "  last_hit INTEGER DEFAULT 0,\n"
                         "  FOREIGN KEY(hid) REFERENCES moz_hosts(id)\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_startups (\n"
                         "  startups INTEGER,\n"
                         "  last_startup INTEGER\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmt;
  rv = mDB->CreateStatement(
      nsDependentCString("SELECT * FROM moz_startups;\n"),
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  // We'll go ahead and keep track of our startup count here, since we can
  // (mostly) equate "the service was created and asked to do stuff" with
  // "the browser was started up".
  bool hasRows;
  rv = stmt->ExecuteStep(&hasRows);
  NS_ENSURE_SUCCESS(rv, rv);
  if (hasRows) {
    // We've started up before. Update our startup statistics
    stmt->GetInt32(0, &mStartupCount);
    stmt->GetInt64(1, &mLastStartupTime);

    // This finalizes the statement
    stmt = nullptr;

    rv = mDB->CreateStatement(
        nsDependentCString("UPDATE moz_startups SET startups = ?, last_startup = ?;\n"),
        getter_AddRefs(stmt));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = stmt->BindInt32Parameter(0, mStartupCount + 1);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = stmt->BindInt64Parameter(1, mStartupTime);
    NS_ENSURE_SUCCESS(rv, rv);

    stmt->Execute();
  } else {
    // This is our first startup, so let's go ahead and mark it as such
    mStartupCount = 1;

    rv = mDB->CreateStatement(
        nsDependentCString("INSERT INTO moz_startups (startups, last_startup) VALUES (1, ?);\n"),
        getter_AddRefs(stmt));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = stmt->BindInt64Parameter(0, mStartupTime);
    NS_ENSURE_SUCCESS(rv, rv);

    stmt->Execute();
  }

  // This finalizes the statement
  stmt = nullptr;

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_startup_pages (\n"
                         "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
                         "  uri TEXT NOT NULL,\n"
                         "  hits INTEGER DEFAULT 0,\n"
                         "  last_hit INTEGER DEFAULT 0\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_pages (\n"
                         "  id integer PRIMARY KEY AUTOINCREMENT,\n"
                         "  uri TEXT NOT NULL,\n"
                         "  loads INTEGER DEFAULT 0,\n"
                         "  last_load INTEGER DEFAULT 0\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_subresources (\n"
                         "  id integer PRIMARY KEY AUTOINCREMENT,\n"
                         "  pid INTEGER NOT NULL,\n"
                         "  uri TEXT NOT NULL,\n"
                         "  hits INTEGER DEFAULT 0,\n"
                         "  last_hit INTEGER DEFAULT 0,\n"
                         "  FOREIGN KEY(pid) REFERENCES moz_pages(id)\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mDB->ExecuteSimpleSQL(
      NS_LITERAL_CSTRING("CREATE TABLE IF NOT EXISTS moz_redirects (\n"
                         "  id integer PRIMARY KEY AUTOINCREMENT,\n"
                         "  pid integer NOT NULL,\n"
                         "  uri TEXT NOT NULL,\n"
                         "  origin TEXT NOT NULL,\n"
                         "  hits INTEGER DEFAULT 0,\n"
                         "  last_hit INTEGER DEFAULT 0,\n"
                         "  FOREIGN KEY(pid) REFERENCES moz_pages(id)\n"
                         ");\n"));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

class SeerDBShutdownRunner : public nsRunnable
{
public:
  SeerDBShutdownRunner()
  { }

  NS_IMETHODIMP Run()
  {
    Seer::gSeer->mStatements.FinalizeStatements();
    Seer::gSeer->mDB->Close();
    Seer::gSeer->mDB = nullptr;
    return NS_OK;
  }
};

void
Seer::Shutdown()
{
  if (!NS_IsMainThread()) {
    MOZ_ASSERT(false, "Seer::Shutdown called off the main thread!");
    return;
  }

  mInitialized = false;

  nsCOMPtr<nsIThread> ioThread;
  mIOThread.swap(ioThread);

  ioThread->Dispatch(new SeerDBShutdownRunner(), NS_DISPATCH_NORMAL);
  ioThread->Shutdown();
}

nsresult
Seer::Create(nsISupports *aOuter, const nsIID& aIID,
    void **aResult)
{
  nsresult rv;

  if (aOuter != nullptr) {
    return NS_ERROR_NO_AGGREGATION;
  }

  Seer *svc = new Seer();
  if (svc == nullptr) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  NS_ADDREF(svc);

  rv = svc->Init();
  if (NS_SUCCEEDED(rv)) {
    rv = svc->QueryInterface(aIID, aResult);
  }
  NS_RELEASE(svc);

  return rv;
}

// Get the full origin (scheme, host, port) out of a URI (maybe should be part
// of nsIURI instead?)
static void
ExtractOrigin(nsIURI *uri, nsAutoCString &s)
{
  nsAutoCString scheme, hostPort;
  nsresult rv = uri->GetScheme(scheme);
  if (NS_SUCCEEDED(rv)) {
    rv = uri->GetHostPort(hostPort);
  }

  if (NS_SUCCEEDED(rv)) {
    s.Assign(scheme);
    s.AppendLiteral("://");
    s.Append(hostPort);
  }
}

class VerifierReleaseEvent : public nsRunnable
{
public:
  VerifierReleaseEvent(nsINetworkSeerVerifier *verifier)
    :mVerifier(verifier)
  { }

  NS_IMETHOD Run()
  {
    if (mVerifier) {
      NS_RELEASE(mVerifier);
    }

    return NS_OK;
  }

private:
  nsINetworkSeerVerifier *mVerifier;
};

// An event to do the work for a prediction that needs to hit the sqlite
// database. These events should be created on the main thread, and run on
// the seer thread.
class SeerPredictionEvent : public nsRunnable
{
public:
  SeerPredictionEvent(nsIURI *target, nsIURI *referer,
      SeerPredictReason reason, nsINetworkSeerVerifier *verifier)
    :mReason(reason)
    ,mVerifier(verifier)
  {
    if (mVerifier) {
      NS_ADDREF(mVerifier);
    }
    if (target) {
      target->GetSpec(mTarget.spec);
      ExtractOrigin(target, mTarget.origin);
    }
    if (referer) {
      referer->GetSpec(mReferer.spec);
      ExtractOrigin(referer, mReferer.origin);
    }
  }

  NS_IMETHOD Run()
  {
    nsresult rv = NS_OK;

    switch (mReason) {
      case nsINetworkSeer::PREDICT_LOAD:
        Seer::gSeer->PredictForPageload(mTarget, mVerifier);
        break;
      case nsINetworkSeer::PREDICT_STARTUP:
        Seer::gSeer->PredictForStartup(mVerifier);
        break;
      default:
        rv = NS_ERROR_UNEXPECTED;
    }

    NS_DispatchToMainThread(new VerifierReleaseEvent(mVerifier));

    return rv;
  }

private:
  uriInfo mTarget;
  uriInfo mReferer;
  SeerPredictReason mReason;
  nsINetworkSeerVerifier *mVerifier;
};

// Predicting for a link is easy, and doesn't require the round-trip to the
// seer thread and back to the main thread, since we don't have to hit the db
// for that.
void
Seer::PredictForLink(nsIURI *target, nsIURI *referer, nsINetworkSeerVerifier *verifier)
{
  if (!mSpeculativeService) {
    return;
  }

  bool isSSL;
  if (NS_SUCCEEDED(referer->SchemeIs("https", &isSSL)) && isSSL) {
    // We don't want to predict from an HTTPS page, to avoid info leakage
    return;
  }

  mSpeculativeService->SpeculativeConnect(target, nullptr);
  if (verifier) {
    verifier->OnPredictPreconnect(target);
  }
}

// This runnable runs on the main thread, and is responsible for actually
// firing off predictive actions (such as TCP/TLS preconnects and DNS lookups)
class SeerPredictionRunner : public nsRunnable
{
public:
  SeerPredictionRunner(nsINetworkSeerVerifier *verifier)
    : mVerifier(verifier)
  { }

  void AddPreconnect(const nsACString &uri)
  {
    mPreconnects.AppendElement(uri);
  }

  void AddPreresolve(const nsACString &uri)
  {
    mPreresolves.AppendElement(uri);
  }

  bool HasWork()
  {
    return !(mPreconnects.IsEmpty() && mPreresolves.IsEmpty());
  }

  NS_IMETHOD Run()
  {
    uint32_t len, i;

    len = mPreconnects.Length();
    for (i = 0; i < len; ++i) {
      nsCOMPtr<nsIURI> uri;
      nsresult rv = NS_NewURI(getter_AddRefs(uri), mPreconnects[i]);
      if (NS_FAILED(rv)) {
        continue;
      }

      Seer::gSeer->mSpeculativeService->SpeculativeConnect(uri, nullptr);
      if (mVerifier) {
        mVerifier->OnPredictPreconnect(uri);
      }
    }

    len = mPreresolves.Length();
    for (i = 0; i < len; ++i) {
      nsCOMPtr<nsIURI> uri;
      nsresult rv = NS_NewURI(getter_AddRefs(uri), mPreresolves[i]);
      if (NS_FAILED(rv)) {
        continue;
      }

      nsAutoCString hostname;
      uri->GetAsciiHost(hostname);
      nsCOMPtr<nsICancelable> tmpCancelable;
      Seer::gSeer->mDnsService->AsyncResolve(hostname,
          nsIDNSService::RESOLVE_PRIORITY_MEDIUM | nsIDNSService::RESOLVE_SPECULATE,
          Seer::gSeer->mListener, nullptr,
          getter_AddRefs(tmpCancelable));
      if (mVerifier) {
        mVerifier->OnPredictDNS(uri);
      }
    }

    mPreconnects.Clear();
    mPreresolves.Clear();

    return NS_OK;
  }

private:
  nsTArray<nsCString> mPreconnects;
  nsTArray<nsCString> mPreresolves;
  nsINetworkSeerVerifier *mVerifier;
};

// This calculates how much to degrade our confidence in our data based on
// the last time this top-level resource was loaded. This "global degradation"
// applies to *all* subresources we have associated with the top-level
// resource. This will be in addition to any reduction in confidence we have
// associated with a particular subresource.
static int
CalculateGlobalDegradation(PRTime now, PRTime lastLoad)
{
  PRTime delta = now - lastLoad;
  if (delta < ONE_DAY) {
    return 0;
  } else if (delta < ONE_WEEK) {
    return 5;
  } else if (delta < ONE_MONTH) {
    return 10;
  } else if (delta < ONE_YEAR) {
    return 25;
  }

  return 50;
}

// This calculates our overall confidence that a particular subresource will be
// loaded as part of a top-level load.
// @param baseConfidence - the basic confidence we have for this subresource,
//                         which is the percentage of time this top-level load
//                         loads the subresource in question
// @param lastHit - the timestamp of the last time we loaded this subresource as
//                  part of this top-level load
// @param lastPossible - the timestamp of the last time we performed this
//                       top-level load
// @param globalDegradation - the degradation for this top-level load as
//                            determined by CalculateGlobalDegradation
static int
CalculateConfidence(int baseConfidence, PRTime lastHit, PRTime lastPossible,
    int globalDegradation)
{
    int maxConfidence = 100;
    int confidenceDegradation = 0;

    if (lastHit < lastPossible) {
      // We didn't load this subresource the last time this top-level load was
      // performed, so let's not bother preconnecting (at the very least).
      maxConfidence = PRECONNECT_MIN - 1;

      // Now calculate how much we want to degrade our confidence based on how
      // long it's been between the last time we did this top-level load and the
      // last time this top-level load included this subresource.
      PRTime delta = lastPossible - lastHit;
      if (delta == 0) {
        confidenceDegradation = 0;
      } else if (delta < ONE_DAY) {
        confidenceDegradation = 1;
      } else if (delta < ONE_WEEK) {
        confidenceDegradation = 10;
      } else if (delta < ONE_MONTH) {
        confidenceDegradation = 25;
      } else if (delta < ONE_YEAR) {
        confidenceDegradation = 50;
      } else {
        confidenceDegradation = 100;
        maxConfidence = 0;
      }
    }

    // Calculate our confidence and clamp it to between 0 and maxConfidence
    // (<= 100)
    int confidence = baseConfidence - confidenceDegradation - globalDegradation;
    confidence = std::max(confidence, 0);
    confidence = std::min(confidence, maxConfidence);

    return confidence;
}

// (Maybe) adds a predictive action to the prediction runner, based on our
// calculated confidence for the subresource in question.
static void
SetupPrediction(int confidence, const nsACString &uri,
    SeerPredictionRunner *runner)
{
    if (confidence >= PRECONNECT_MIN) {
      runner->AddPreconnect(uri);
    } else if (confidence >= PRERESOLVE_MIN) {
      runner->AddPreresolve(uri);
    }
}

// This gets the data about the top-level load from our database, either from
// the pages table (which is specific to a particular URI), or from the hosts
// table (which is for a particular origin).
bool
Seer::LookupTopLevel(QueryType queryType, const nsACString &key,
                     TopLevelInfo &info)
{
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("SELECT * FROM moz_pages WHERE uri = ?;"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("SELECT * FROM moz_hosts WHERE origin = ?;"));
  }
  NS_ENSURE_TRUE(stmt, false);
  mozStorageStatementScoper scope(stmt);

  nsresult rv = stmt->BindUTF8StringParameter(0, key);
  NS_ENSURE_SUCCESS(rv, false);

  bool hasRows;
  rv = stmt->ExecuteStep(&hasRows);
  NS_ENSURE_SUCCESS(rv, false);

  if (!hasRows) {
    return false;
  }

  rv = stmt->GetInt32(0, &info.id);
  NS_ENSURE_SUCCESS(rv, false);

  rv = stmt->GetInt32(2, &info.loadCount);
  NS_ENSURE_SUCCESS(rv, false);

  rv = stmt->GetInt64(3, &info.lastLoad);
  NS_ENSURE_SUCCESS(rv, false);

  return true;
}

// Insert data about either a top-level page or a top-level origin into
// the database.
void
Seer::AddTopLevel(QueryType queryType, const nsACString &key, PRTime now)
{
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("INSERT INTO moz_pages (uri, loads, last_load) "
          "VALUES (?, 1, ?);"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("INSERT INTO moz_hosts (origin, loads, last_load) "
          "VALUES (?, 1, ?);"));
  }
  if (!stmt) {
    return;
  }
  mozStorageStatementScoper scope(stmt);

  // Loading a page implicitly makes the seer learn about the page,
  // so since we don't have it already, let's add it.
  nsresult rv = stmt->BindUTF8StringParameter(0, key);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindInt64Parameter(1, now);
  RETURN_IF_FAILED(rv);

  rv = stmt->Execute();
}

// Update data about either a top-level page or a top-level origin in the
// database.
void
Seer::UpdateTopLevel(QueryType queryType, const TopLevelInfo &info, PRTime now)
{
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("UPDATE moz_pages SET loads = ?, last_load = ? "
          "WHERE id = ?;"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("UPDATE moz_hosts SET loads = ?, last_load = ? "
          "WHERE id = ?;"));
  }
  if (!stmt) {
    return;
  }
  mozStorageStatementScoper scope(stmt);

  // First, let's update the page in the database, since loading a page
  // implicitly learns about the page.
  nsresult rv = stmt->BindInt32Parameter(0, info.loadCount + 1);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindInt64Parameter(1, now);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindInt32Parameter(2, info.id);
  RETURN_IF_FAILED(rv);

  rv = stmt->Execute();
}

// Tries to predict for a top-level load (either page-based or origin-based).
// Returns false if it failed to predict at all, true if it did some sort of
// prediction.
// @param queryType - whether to predict based on page or origin
// @param info - the db info about the top-level resource
bool
Seer::TryPredict(QueryType queryType, const TopLevelInfo &info, PRTime now, nsINetworkSeerVerifier *verifier)
{
  int globalDegradation = CalculateGlobalDegradation(now, info.lastLoad);

  // Now let's look up the subresources we know about for this page
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("SELECT * FROM moz_subresources WHERE pid = ?;"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("SELECT * FROM moz_subhosts WHERE hid = ?;"));
  }
  NS_ENSURE_TRUE(stmt, false);
  mozStorageStatementScoper scope(stmt);

  nsresult rv = stmt->BindInt32Parameter(0, info.id);
  NS_ENSURE_SUCCESS(rv, false);

  bool hasRows;
  rv = stmt->ExecuteStep(&hasRows);
  NS_ENSURE_SUCCESS(rv, false);

  nsRefPtr<SeerPredictionRunner> runner = new SeerPredictionRunner(verifier);

  while (hasRows) {
    int32_t hitCount;
    PRTime lastHit;
    nsAutoCString subresource;
    int baseConfidence, confidence;

    // We use goto nextrow here instead of just failling, because we want
    // to do some sort of prediction if at all possible. Of course, it's
    // probably unlikely that subsequent rows will succeed if one fails, but
    // it's worth a shot.

    rv = stmt->GetUTF8String(2, subresource);
    if NS_FAILED(rv) {
      goto nextrow;
    }

    rv = stmt->GetInt32(3, &hitCount);
    if (NS_FAILED(rv)) {
      goto nextrow;
    }

    rv = stmt->GetInt64(4, &lastHit);
    if (NS_FAILED(rv)) {
      goto nextrow;
    }

    baseConfidence = (hitCount * 100) / info.loadCount;
    confidence = CalculateConfidence(baseConfidence, lastHit, info.lastLoad,
        globalDegradation);
    SetupPrediction(confidence, subresource, runner);

nextrow:
    rv = stmt->ExecuteStep(&hasRows);
    NS_ENSURE_SUCCESS(rv, false);
  }

  bool predicted = false;

  if (runner->HasWork()) {
    NS_DispatchToMainThread(runner);
    predicted = true;
  }

  return predicted;
}

// Find out if a top-level page is likely to redirect.
bool
Seer::WouldRedirect(const TopLevelInfo &info, PRTime now, uriInfo &newUri)
{
  nsCOMPtr<mozIStorageStatement> stmt = mStatements.GetCachedStatement(
      NS_LITERAL_CSTRING("SELECT * FROM moz_redirects WHERE pid = ?"));
  NS_ENSURE_TRUE(stmt, false);
  mozStorageStatementScoper scope(stmt);

  nsresult rv = stmt->BindInt32Parameter(0, info.id);
  NS_ENSURE_SUCCESS(rv, false);

  bool hasRows;
  rv = stmt->ExecuteStep(&hasRows);
  NS_ENSURE_SUCCESS(rv, false);

  if (!hasRows) {
    return false;
  }

  rv = stmt->GetUTF8String(2, newUri.spec);
  NS_ENSURE_SUCCESS(rv, false);

  rv = stmt->GetUTF8String(3, newUri.origin);
  NS_ENSURE_SUCCESS(rv, false);

  int32_t hitCount;
  rv = stmt->GetInt32(4, &hitCount);
  NS_ENSURE_SUCCESS(rv, false);

  PRTime lastHit;
  rv = stmt->GetInt64(5, &lastHit);
  NS_ENSURE_SUCCESS(rv, false);

  int globalDegradation = CalculateGlobalDegradation(now, info.lastLoad);
  int baseConfidence = (hitCount * 100) / info.loadCount;
  int confidence = CalculateConfidence(baseConfidence, lastHit, info.lastLoad,
      globalDegradation);

  if (confidence > REDIRECT_LIKELY) {
    return true;
  }

  return false;
}

// This will add a page to our list of startup pages if it's being loaded
// before our startup window has expired.
void
Seer::MaybeLearnForStartup(const uriInfo &uri, const PRTime now)
{
  if ((now - mStartupTime) < STARTUP_WINDOW) {
    LearnForStartup(uri);
  }
}

// This is the driver for prediction based on a new pageload.
void
Seer::PredictForPageload(const uriInfo &uri, nsINetworkSeerVerifier *verifier)
{
  if (NS_FAILED(EnsureInitStorage())) {
    return;
  }

  PRTime now = PR_Now();

  MaybeLearnForStartup(uri, now);

  TopLevelInfo pageInfo;
  TopLevelInfo originInfo;
  bool havePage = LookupTopLevel(QUERY_PAGE, uri.spec, pageInfo);
  bool haveOrigin = LookupTopLevel(QUERY_ORIGIN, uri.origin, originInfo);

  if (!havePage) {
    AddTopLevel(QUERY_PAGE, uri.spec, now);
  } else {
    UpdateTopLevel(QUERY_PAGE, pageInfo, now);
  }

  if (!haveOrigin) {
    AddTopLevel(QUERY_ORIGIN, uri.origin, now);
  } else {
    UpdateTopLevel(QUERY_ORIGIN, originInfo, now);
  }

  uriInfo newUri;
  if (havePage && WouldRedirect(pageInfo, now, newUri)) {
    nsRefPtr<SeerPredictionRunner> runner = new SeerPredictionRunner(verifier);
    runner->AddPreconnect(newUri.spec);
    NS_DispatchToMainThread(runner);
    PredictForPageload(newUri, verifier);
    return;
  }

  bool predicted = false;

  // We always try to be as specific as possible in our predictions, so try
  // to predict based on the full URI before we fall back to the origin.
  if (havePage) {
    predicted = TryPredict(QUERY_PAGE, pageInfo, now, verifier);
  }

  if (!predicted && haveOrigin) {
    TryPredict(QUERY_ORIGIN, originInfo, now, verifier);
  }
}

// This is the driver for predicting at browser startup time based on pages that
// have previously been loaded close to startup.
void
Seer::PredictForStartup(nsINetworkSeerVerifier *verifier)
{
  if (NS_FAILED(EnsureInitStorage())) {
    return;
  }

  nsCOMPtr<mozIStorageStatement> stmt = mStatements.GetCachedStatement(
      NS_LITERAL_CSTRING("SELECT * FROM moz_startup_pages;"));
  if (!stmt) {
    return;
  }
  mozStorageStatementScoper scope(stmt);
  nsresult rv;
  bool hasRows;

  nsRefPtr<SeerPredictionRunner> runner = new SeerPredictionRunner(verifier);

  rv = stmt->ExecuteStep(&hasRows);
  RETURN_IF_FAILED(rv);

  while (hasRows) {
    nsAutoCString uri;
    int32_t hitCount;
    PRTime lastHit;
    int baseConfidence, confidence;

    // We use goto nextrow here instead of just failling, because we want
    // to do some sort of prediction if at all possible. Of course, it's
    // probably unlikely that subsequent rows will succeed if one fails, but
    // it's worth a shot.

    rv = stmt->GetUTF8String(1, uri);
    if (NS_FAILED(rv)) {
      goto nextrow;
    }

    rv = stmt->GetInt32(2, &hitCount);
    if (NS_FAILED(rv)) {
      goto nextrow;
    }

    rv = stmt->GetInt64(3, &lastHit);
    if (NS_FAILED(rv)) {
      goto nextrow;
    }

    baseConfidence = (hitCount * 100) / mStartupCount;
    confidence = CalculateConfidence(baseConfidence, lastHit,
        mLastStartupTime, 0);
    SetupPrediction(confidence, uri, runner);

nextrow:
    rv = stmt->ExecuteStep(&hasRows);
    RETURN_IF_FAILED(rv);
  }

  if (runner->HasWork()) {
    NS_DispatchToMainThread(runner);
  }
}

// All URIs we get passed *must* be http or https if they're not null. This
// helps ensure that.
static bool
IsNullOrHttp(nsIURI *uri)
{
  if (!uri) {
    return true;
  }

  bool isHTTP = false;
  if (NS_SUCCEEDED(uri->SchemeIs("http", &isHTTP)) && !isHTTP) {
    uri->SchemeIs("https", &isHTTP);
  }

  return isHTTP;
}

// Called from the main thread to initiate predictive actions
NS_IMETHODIMP
Seer::Predict(nsIURI *target, nsIURI *referer,
    SeerPredictReason reason, nsILoadContext *loadContext,
    nsINetworkSeerVerifier *verifier)
{
  MOZ_ASSERT(NS_IsMainThread(),
      "Seer interface methods must be called on the main thread");

  if (!mInitialized) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  if (!mObserver->IsEnabled()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  if (loadContext && loadContext->UsePrivateBrowsing()) {
    // Don't want to do anything in PB mode
    return NS_OK;
  }

  if (!IsNullOrHttp(target) || !IsNullOrHttp(referer)) {
    // Nothing we can do for non-HTTP[S] schemes
    return NS_OK;
  }

  // Ensure we've been given the appropriate arguments for the kind of
  // prediction we're being asked to do
  switch (reason) {
    case nsINetworkSeer::PREDICT_LINK:
      if (!target || !referer) {
        return NS_ERROR_INVALID_ARG;
      }
      // Link hover is a special case where we can predict without hitting the
      // db, so let's go ahead and fire off that prediction here.
      PredictForLink(target, referer, verifier);
      return NS_OK;
    case nsINetworkSeer::PREDICT_LOAD:
      if (!target || referer) {
        return NS_ERROR_INVALID_ARG;
      }
      break;
    case nsINetworkSeer::PREDICT_STARTUP:
      if (target || referer) {
        return NS_ERROR_INVALID_ARG;
      }
      break;
    default:
      return NS_ERROR_INVALID_ARG;
  }

  return mIOThread->Dispatch(
      new SeerPredictionEvent(target, referer, reason, verifier),
      NS_DISPATCH_NORMAL);
}

// A runnable for updating our information in the database. This must always
// be dispatched to the seer thread.
class SeerLearnEvent : public nsRunnable
{
public:
  SeerLearnEvent(nsIURI *target, nsIURI *referer, SeerLearnReason reason)
    :mReason(reason)
  {
    target->GetSpec(mTarget.spec);
    ExtractOrigin(target, mTarget.origin);
    if (referer) {
      referer->GetSpec(mReferer.spec);
      ExtractOrigin(referer, mReferer.origin);
    }
  }

  NS_IMETHOD Run()
  {
    switch (mReason) {
    case nsINetworkSeer::LEARN_LOAD_TOPLEVEL:
      Seer::gSeer->LearnForToplevel(mTarget);
      break;
    case nsINetworkSeer::LEARN_LOAD_REDIRECT:
      Seer::gSeer->LearnForRedirect(mTarget, mReferer);
      break;
    case nsINetworkSeer::LEARN_LOAD_SUBRESOURCE:
      Seer::gSeer->LearnForSubresource(mTarget, mReferer);
      break;
    case nsINetworkSeer::LEARN_STARTUP:
      Seer::gSeer->LearnForStartup(mTarget);
      break;
    default:
      return NS_ERROR_UNEXPECTED;
    }

    return NS_OK;
  }
private:
  uriInfo mTarget;
  uriInfo mReferer;
  nsAutoCString mRefererSHP;
  SeerLearnReason mReason;
};

void
Seer::LearnForToplevel(const uriInfo &uri)
{
  if (NS_FAILED(EnsureInitStorage())) {
    return;
  }

  PRTime now = PR_Now();

  MaybeLearnForStartup(uri, now);

  TopLevelInfo pageInfo;
  TopLevelInfo originInfo;
  bool havePage = LookupTopLevel(QUERY_PAGE, uri.spec, pageInfo);
  bool haveOrigin = LookupTopLevel(QUERY_ORIGIN, uri.origin, originInfo);

  if (!havePage) {
    AddTopLevel(QUERY_PAGE, uri.spec, now);
  } else {
    UpdateTopLevel(QUERY_PAGE, pageInfo, now);
  }

  if (!haveOrigin) {
    AddTopLevel(QUERY_ORIGIN, uri.origin, now);
  } else {
    UpdateTopLevel(QUERY_ORIGIN, originInfo, now);
  }
}

// Queries to look up information about a *specific* subresource associated
// with a *specific* top-level load.
bool
Seer::LookupSubresource(QueryType queryType, const int32_t parentId,
    const nsACString &key, SubresourceInfo &info)
{
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("SELECT * FROM moz_subresources WHERE pid = ? AND "
          "uri = ?;"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("SELECT * FROM moz_subhosts WHERE hid = ? AND "
          "origin = ?;"));
  }
  NS_ENSURE_TRUE(stmt, false);
  mozStorageStatementScoper scope(stmt);

  nsresult rv = stmt->BindInt32Parameter(0, parentId);
  NS_ENSURE_SUCCESS(rv, false);

  rv = stmt->BindUTF8StringParameter(1, key);
  NS_ENSURE_SUCCESS(rv, false);

  bool hasRows;
  rv = stmt->ExecuteStep(&hasRows);
  NS_ENSURE_SUCCESS(rv, false);
  if (!hasRows) {
    return false;
  }

  rv = stmt->GetInt32(0, &info.id);
  NS_ENSURE_SUCCESS(rv, false);

  rv = stmt->GetInt32(3, &info.hitCount);
  NS_ENSURE_SUCCESS(rv, false);

  rv = stmt->GetInt64(4, &info.lastHit);
  NS_ENSURE_SUCCESS(rv, false);

  return true;
}

// Add information about a new subresource associated with a top-level load.
void
Seer::AddSubresource(QueryType queryType, const int32_t parentId,
    const nsACString &key, const PRTime now)
{
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("INSERT INTO moz_subresources "
          "(pid, uri, hits, last_hit) VALUES (?, ?, 1, ?);"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("INSERT INTO moz_subhosts "
          "(hid, origin, hits, last_hit) VALUES (?, ?, 1, ?);"));
  }
  if (!stmt) {
    return;
  }
  mozStorageStatementScoper scope(stmt);

  nsresult rv = stmt->BindInt32Parameter(0, parentId);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindUTF8StringParameter(1, key);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindInt64Parameter(2, now);
  RETURN_IF_FAILED(rv);

  rv = stmt->Execute();
}

// Update the information about a particular subresource associated with a
// top-level load
void
Seer::UpdateSubresource(QueryType queryType, const SubresourceInfo &info,
    const PRTime now)
{
  nsCOMPtr<mozIStorageStatement> stmt;
  if (queryType == QUERY_PAGE) {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("UPDATE moz_subresources SET hits = ?, last_hit = ? "
          "WHERE id = ?;"));
  } else {
    stmt = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("UPDATE moz_subhosts SET hits = ?, last_hit = ? "
          "WHERE id = ?;"));
  }
  if (!stmt) {
    return;
  }
  mozStorageStatementScoper scope(stmt);

  nsresult rv = stmt->BindInt32Parameter(0, info.hitCount + 1);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindInt64Parameter(1, now);
  RETURN_IF_FAILED(rv);

  rv = stmt->BindInt32Parameter(2, info.id);
  RETURN_IF_FAILED(rv);

  rv = stmt->Execute();
}

// Called when a subresource has been hit from a top-level load. Uses the two
// helper functions above to update the database appropriately.
void
Seer::LearnForSubresource(const uriInfo &target,
    const uriInfo &referer)
{
  if (NS_FAILED(EnsureInitStorage())) {
    return;
  }

  TopLevelInfo pageInfo, originInfo;
  bool havePage = LookupTopLevel(QUERY_PAGE, referer.spec, pageInfo);
  bool haveOrigin = LookupTopLevel(QUERY_ORIGIN, referer.origin, originInfo);

  if (!havePage && !haveOrigin) {
    // Nothing to do, since we know nothing about the top level resource
    return;
  }

  SubresourceInfo resourceInfo;
  bool haveResource = false;
  if (havePage) {
    haveResource = LookupSubresource(QUERY_PAGE, pageInfo.id, target.spec,
        resourceInfo);
  }

  SubresourceInfo hostInfo;
  bool haveHost = false;
  if (haveOrigin) {
    haveHost = LookupSubresource(QUERY_ORIGIN, originInfo.id, target.origin,
        hostInfo);
  }

  PRTime now = PR_Now();

  if (haveResource) {
    UpdateSubresource(QUERY_PAGE, resourceInfo, now);
  } else if (havePage) {
    AddSubresource(QUERY_PAGE, pageInfo.id, target.spec, now);
  }
  // Can't add a subresource to a page we don't have in our db.

  if (haveHost) {
    UpdateSubresource(QUERY_ORIGIN, hostInfo, now);
  } else if (haveOrigin) {
    AddSubresource(QUERY_ORIGIN, originInfo.id, target.origin, now);
  }
  // Can't add a subhost to a host we don't have in our db
}

// This is called when a top-level loaded ended up redirecting to a different
// URI so we can keep track of that fact.
void
Seer::LearnForRedirect(const uriInfo &dest,
    const uriInfo &source)
{
  if (NS_FAILED(EnsureInitStorage())) {
    return;
  }

  PRTime now = PR_Now();
  nsresult rv;

  nsCOMPtr<mozIStorageStatement> getPage = mStatements.GetCachedStatement(
      NS_LITERAL_CSTRING("SELECT * FROM moz_pages WHERE uri = ?;"));
  if (!getPage) {
    return;
  }
  mozStorageStatementScoper scopedPage(getPage);

  // look up referer in moz_pages
  rv = getPage->BindUTF8StringParameter(0, source.spec);
  RETURN_IF_FAILED(rv);

  bool hasRows;
  rv = getPage->ExecuteStep(&hasRows);
  if (NS_FAILED(rv) || !hasRows) {
    return;
  }

  int32_t pageId;
  rv = getPage->GetInt32(0, &pageId);
  RETURN_IF_FAILED(rv);

  nsCOMPtr<mozIStorageStatement> getRedirect = mStatements.GetCachedStatement(
      NS_LITERAL_CSTRING("SELECT * FROM moz_redirects WHERE pid = ? AND "
        "uri = ?;"));
  if (!getRedirect) {
    return;
  }
  mozStorageStatementScoper scopedRedirect(getRedirect);

  rv = getRedirect->BindInt32Parameter(0, pageId);
  RETURN_IF_FAILED(rv);

  rv = getRedirect->BindUTF8StringParameter(1, dest.spec);
  RETURN_IF_FAILED(rv);

  rv = getRedirect->ExecuteStep(&hasRows);
  RETURN_IF_FAILED(rv);

  if (!hasRows) {
    // This is the first time we've seen this top-level redirect to this URI
    nsCOMPtr<mozIStorageStatement> addRedirect = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("INSERT INTO moz_redirects "
          "(pid, uri, origin, hits, last_hit) VALUES (?, ?, ?, 1, ?);"));
    if (!addRedirect) {
      return;
    }
    mozStorageStatementScoper scopedAdd(addRedirect);

    rv = addRedirect->BindInt32Parameter(0, pageId);
    RETURN_IF_FAILED(rv);

    rv = addRedirect->BindUTF8StringParameter(1, dest.spec);
    RETURN_IF_FAILED(rv);

    rv = addRedirect->BindUTF8StringParameter(2, dest.origin);
    RETURN_IF_FAILED(rv);

    rv = addRedirect->BindInt64Parameter(3, now);
    RETURN_IF_FAILED(rv);

    rv = addRedirect->Execute();
  } else {
    // We've seen this redirect before
    int32_t redirId, hits;
    rv = getRedirect->GetInt32(0, &redirId);
    RETURN_IF_FAILED(rv);

    rv = getRedirect->GetInt32(3, &hits);
    RETURN_IF_FAILED(rv);

    nsCOMPtr<mozIStorageStatement> updateRedirect = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("UPDATE moz_redirects SET hits = ?, last_hit = ? "
          "WHERE id = ?;"));
    if (!updateRedirect) {
      return;
    }
    mozStorageStatementScoper scopedUpdate(updateRedirect);

    rv = updateRedirect->BindInt32Parameter(0, hits + 1);
    RETURN_IF_FAILED(rv);

    rv = updateRedirect->BindInt64Parameter(1, now);
    RETURN_IF_FAILED(rv);

    rv = updateRedirect->BindInt32Parameter(2, redirId);
    RETURN_IF_FAILED(rv);

    updateRedirect->Execute();
  }
}

// Add information about a top-level load to our list of startup pages
void
Seer::LearnForStartup(const uriInfo &uri)
{
  if (NS_FAILED(EnsureInitStorage())) {
    return;
  }

  nsCOMPtr<mozIStorageStatement> getPage = mStatements.GetCachedStatement(
      NS_LITERAL_CSTRING("SELECT * FROM moz_startup_pages WHERE uri = ?;"));
  if (!getPage) {
    return;
  }
  mozStorageStatementScoper scopedPage(getPage);
  nsresult rv;

  rv = getPage->BindUTF8StringParameter(0, uri.origin);
  RETURN_IF_FAILED(rv);

  bool hasRows;
  rv = getPage->ExecuteStep(&hasRows);
  RETURN_IF_FAILED(rv);

  if (hasRows) {
    // We've loaded this page on startup before
    int32_t pageId, hitCount;

    rv = getPage->GetInt32(0, &pageId);
    RETURN_IF_FAILED(rv);

    rv = getPage->GetInt32(2, &hitCount);
    RETURN_IF_FAILED(rv);

    nsCOMPtr<mozIStorageStatement> updatePage = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("UPDATE moz_startup_pages SET hits = ?, last_hit = ? "
          "WHERE id = ?;"));
    if (!updatePage) {
      return;
    }
    mozStorageStatementScoper scopedUpdate(updatePage);

    rv = updatePage->BindInt32Parameter(0, hitCount + 1);
    RETURN_IF_FAILED(rv);

    rv = updatePage->BindInt64Parameter(1, mStartupTime);
    RETURN_IF_FAILED(rv);

    rv = updatePage->BindInt32Parameter(2, pageId);
    RETURN_IF_FAILED(rv);

    updatePage->Execute();
  } else {
    // New startup page
    nsCOMPtr<mozIStorageStatement> addPage = mStatements.GetCachedStatement(
        NS_LITERAL_CSTRING("INSERT INTO moz_startup_pages (uri, hits, last_hit) "
          "VALUES (?, 1, ?);"));
    if (!addPage) {
      return;
    }
    mozStorageStatementScoper scopedAdd(addPage);
    rv = addPage->BindUTF8StringParameter(0, uri.origin);
    RETURN_IF_FAILED(rv);

    rv = addPage->BindInt64Parameter(1, mStartupTime);
    RETURN_IF_FAILED(rv);

    addPage->Execute();
  }
}

// Called from the main thread to update the database
NS_IMETHODIMP
Seer::Learn(nsIURI *target, nsIURI *referer,
    SeerLearnReason reason, nsILoadContext *loadContext)
{
  MOZ_ASSERT(NS_IsMainThread(),
      "Seer interface methods must be called on the main thread");

  if (!mInitialized) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  if (!mObserver->IsEnabled()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  if (loadContext && loadContext->UsePrivateBrowsing()) {
    // Don't want to do anything in PB mode
    return NS_OK;
  }

  switch (reason) {
  case nsINetworkSeer::LEARN_LOAD_TOPLEVEL:
  case nsINetworkSeer::LEARN_STARTUP:
    if (!target || referer) {
      return NS_ERROR_INVALID_ARG;
    }
    break;
  case nsINetworkSeer::LEARN_LOAD_REDIRECT:
  case nsINetworkSeer::LEARN_LOAD_SUBRESOURCE:
    if (!target || !referer) {
      return NS_ERROR_INVALID_ARG;
    }
    break;
  default:
    return NS_ERROR_INVALID_ARG;
  }

  return mIOThread->Dispatch(
      new SeerLearnEvent(target, referer, reason),
      NS_DISPATCH_NORMAL);
}

// Runnable to clear out the database. Dispatched from the main thread to the
// seer thread
class SeerResetEvent : public nsRunnable
{
public:
  SeerResetEvent()
  { }

  NS_IMETHOD Run()
  {
    Seer::gSeer->DoReset();

    return NS_OK;
  }
};

// Helper that actually does the database wipe.
void
Seer::DoReset()
{
  nsresult rv = EnsureInitStorage();
  RETURN_IF_FAILED(rv);

  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_redirects"));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_subresoruces"));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_pages"));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_startup_pages"));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_startups"));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_subhosts"));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("DELETE FROM moz_hosts"));
}

// Called on the main thread to clear out all our knowledge. Tabula Rasa FTW!
NS_IMETHODIMP
Seer::Reset()
{
  MOZ_ASSERT(NS_IsMainThread(),
      "Seer interface methods must be called on the main thread");

  if (!mInitialized) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  return mIOThread->Dispatch(new SeerResetEvent(), NS_DISPATCH_NORMAL);
}

} // ::mozilla::net
} // ::mozilla
