/* vim: set ts=2 sts=2 et sw=2: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_Seer_h
#define mozilla_net_Seer_h

#include "nsINetworkSeer.h"

#include "nsCOMPtr.h"
#include "nsIDNSService.h"
#include "nsINetworkSeerVerifier.h"
#include "nsIObserver.h"
#include "nsISpeculativeConnect.h"
#include "nsThreadUtils.h"

#include "mozIStorageService.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "mozilla/storage/StatementCache.h"

namespace mozilla {
namespace net {

class SeerObserver;
class SeerDNSListener;
class SeerPredictionRunner;

// This is a proxy for the information we need from an nsIURI
struct uriInfo {
  nsAutoCString spec;
  nsAutoCString origin;
};

class Seer : public nsINetworkSeer
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINETWORKSEER

  Seer();
  virtual ~Seer();

  nsresult Init();
  void Shutdown();
  static nsresult Create(nsISupports *outer, const nsIID& iid, void **result);

private:
  friend class SeerPredictionEvent;
  friend class SeerLearnEvent;
  friend class SeerResetEvent;
  friend class SeerPredictionRunner;
  friend class SeerObserver;
  friend class SeerDBShutdownRunner;

  static Seer *gSeer;

  nsresult EnsureInitStorage();

  void PredictForLink(nsIURI *target, nsIURI *referer, nsINetworkSeerVerifier *verifier);
  void PredictForPageload(const uriInfo &dest, nsINetworkSeerVerifier *verifier);
  void PredictForStartup(nsINetworkSeerVerifier *verifier);

  // Whether we're working on a page or an origin
  enum QueryType {
    QUERY_PAGE = 0,
    QUERY_ORIGIN
  };

  // Holds info from the db about a top-level page or origin
  struct TopLevelInfo {
    int32_t id;
    int32_t loadCount;
    PRTime lastLoad;
  };

  // Holds info from the db about a subresource
  struct SubresourceInfo {
    int32_t id;
    int32_t hitCount;
    PRTime lastHit;
  };

  bool LookupTopLevel(QueryType queryType, const nsACString &key, TopLevelInfo &info);
  void AddTopLevel(QueryType queryType, const nsACString &key, PRTime now);
  void UpdateTopLevel(QueryType queryType, const TopLevelInfo &info, PRTime now);
  bool TryPredict(QueryType queryType, const TopLevelInfo &info, PRTime now, nsINetworkSeerVerifier *verifier);
  bool WouldRedirect(const TopLevelInfo &info, PRTime now, uriInfo &newUri);

  bool LookupSubresource(QueryType queryType, const int32_t parentId, const nsACString &key, SubresourceInfo &info);
  void AddSubresource(QueryType queryType, const int32_t parentId, const nsACString &key, PRTime now);
  void UpdateSubresource(QueryType queryType, const SubresourceInfo &info, PRTime now);

  void MaybeLearnForStartup(const uriInfo &uri, const PRTime now);

  void LearnForToplevel(const uriInfo &uri);
  void LearnForSubresource(const uriInfo &target, const uriInfo &referer);
  void LearnForRedirect(const uriInfo &dest, const uriInfo &source);
  void LearnForStartup(const uriInfo &uri);

  void DoReset();

  bool mInitialized;

  nsCOMPtr<nsIThread> mIOThread;

  nsCOMPtr<nsISpeculativeConnect> mSpeculativeService;

  nsCOMPtr<nsIFile> mDBFile;
  nsCOMPtr<mozIStorageService> mStorageService;
  nsCOMPtr<mozIStorageConnection> mDB;
  mozilla::storage::StatementCache<mozIStorageStatement> mStatements;

  PRTime mStartupTime;
  PRTime mLastStartupTime;
  int32_t mStartupCount;

  nsRefPtr<SeerObserver> mObserver;

  nsRefPtr<SeerDNSListener> mListener;

  nsCOMPtr<nsIDNSService> mDnsService;
};

} // ::mozilla::net
} // ::mozilla

#endif // mozilla_net_Seer_h
