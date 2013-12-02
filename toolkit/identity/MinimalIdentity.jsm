/* -*- Mode: js2; js2-basic-offset: 2; indent-tabs-mode: nil; -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This alternate implementation of IdentityService provides just the
 * channels for navigator.id, leaving the certificate storage to a
 * server-provided app.
 *
 * On b2g, the messages identity-controller-watch, -request, and
 * -logout, are observed by the component SignInToWebsite.jsm.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["IdentityService"];

const Cu = Components.utils;
const Ci = Components.interfaces;
const Cc = Components.classes;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/identity/LogUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "objectCopy",
                                  "resource://gre/modules/identity/IdentityUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this,
                                  "jwcrypto",
                                  "resource://gre/modules/identity/jwcrypto.jsm");

XPCOMUtils.defineLazyModuleGetter(this,
                                  "FxAccountsManager",
                                  "resource://gre/modules/FxAccountsManager.jsm");

const PREF_ALLOW_FXA = "identity.fxaccounts.allow-non-certified";
const PREF_FXA_ISSUER = "identity.fxaccounts.issuer";
const PREF_FXA_ENABLED = "identity.fxaccounts.enabled";
const DEFAULT_FXA_ISSUER = "firefox-accounts";

function log(...aMessageArgs) {
  Logger.log.apply(Logger, ["minimal core"].concat(aMessageArgs));
}
function reportError(...aMessageArgs) {
  Logger.reportError.apply(Logger, ["minimal core"].concat(aMessageArgs));
}

function makeMessageObject(aRpCaller) {
  let options = {};

  options.id = aRpCaller.id;
  options.origin = aRpCaller.origin;

  // loggedInUser can be undefined, null, or a string
  options.loggedInUser = aRpCaller.loggedInUser;

  // Special flag for internal calls
  options._internal = aRpCaller._internal;

  Object.keys(aRpCaller).forEach(function(option) {
    // Duplicate the callerobject, scrubbing out functions and other
    // internal variables (like _mm, the message manager object)
    if (!Object.hasOwnProperty(this, option)
        && option[0] !== '_'
        && typeof aRpCaller[option] !== 'function') {
      options[option] = aRpCaller[option];
    }
  });

  // check validity of message structure
  if ((typeof options.id === 'undefined') ||
      (typeof options.origin === 'undefined')) {
    let err = "id and origin required in relying-party message: " + JSON.stringify(options);
    reportError(err);
    throw new Error(err);
  }

  return options;
}

/*
 * The DOM API can request assertions from Persona or from Firefox Accounts.
 * The two systems have very different implementations.  The Persona flows take
 * place in hosted web-based iframes (see comments in
 * b2g/components/SignInToWebsite.jsm).  The Firefox Accounts flows are
 * natively implemented, interact with the Firefox Accounts servers, and have a
 * different internal messaging API from Persona.
 *
 * The IdentityService below is a single point of contact for the DOM
 * components.  It uses the PersonaDelegate or the FirefoxAccountsDelegate as
 * appropriate to route through one system or the other.
 */

function PersonaDelegate(aContext) {
  // We do not need to access aContext.  All communication is done through
  // observer notifications.  The SignInToWebsite module in turn will call
  // methods on the IdentityService.
}

PersonaDelegate.prototype = {
  watch: function personaWatch(aRp) {
    let options = makeMessageObject(aRp);
    log("sending identity-controller-watch:", options);
    Services.obs.notifyObservers({ wrappedJSObject: options },
                                 "identity-controller-watch", null);
  },

  unwatch: function personaUnwatch(aRp, aTargetMM) {
    let options = makeMessageObject({
      id: aRp.id,
      origin: aRp.origin,
      messageManager: aTargetMM
    });
    log("sending identity-controller-unwatch for id",
        options.id, options.origin);
    Services.obs.notifyObservers({ wrappedJSObject: options },
                                 "identity-controller-unwatch", null);

  },

  request: function personaRequest(aRp, aOptions) {
    // Notify UX to display identity picker.
    // Pass the doc id to UX so it can pass it back to us later.
    let options = makeMessageObject(aRp);
    objectCopy(aOptions, options);
    Services.obs.notifyObservers({ wrappedJSObject: options },
                                 "identity-controller-request", null);
  },

  logout: function personaLogout(aRp) {
    let options = makeMessageObject(aRp);
    Services.obs.notifyObservers({ wrappedJSObject: options },
                                 "identity-controller-logout", null);
  }
};

function FirefoxAccountsDelegate(aContext) {
  this.context = aContext;
};

FirefoxAccountsDelegate.prototype = {
  watch: function fxAccountsWatch(aRp) {
    // There is nothing to do other than asynchronously trigger the .onready
    // callback.
    let context = this.context;
    let runnable = {
      run: function() {
        context.doReady(aRp.id);
      }
    };
    Services.tm.currentThread.dispatch(runnable,
                                       Ci.nsIThread.DISPATCH_NORMAL);
  },

  unwatch: function fxAccountsUnwatch(aRp, aTargetMM) {
    // nothing to do
  },

  request: function fxAccountsRequest(aRp, aOptions) {
    FxAccountsManager.getAssertion(aRp.origin).then(
      data => {
        log("Assertion " + JSON.stringify(data));
        this.context.doLogin(aRp.id, data);
      },
      error => {
        log("Error getting assertion " + JSON.stringify(error));
        reportError(error);
      }
    );
  },

  logout: function fxAccountsLogout(aRp) {
    // For now, it makes no sense to logout from an specific RP in
    // Firefox Accounts, so we just directly call the onlogout callback.
    this.doLogout(aRp.id);
  }
};

function IDService(aOptions) {
  aOptions = aOptions || {};

  Services.obs.addObserver(this, "quit-application-granted", false);

  // simplify, it's one object
  this.RP = this;
  this.IDP = this;

  // keep track of flows
  this._rpFlows = {};
  this._authFlows = {};
  this._provFlows = {};

  this._delegates = {
    "firefox-accounts": new FirefoxAccountsDelegate(this),
    "persona": new PersonaDelegate(this)
  };

  try {
    this._fxaEnabled =
      Services.prefs.getPrefType(PREF_FXA_ENABLED) == Ci.nsIPrefBranch.PREF_BOOL
      && Services.prefs.getBoolPref(PREF_FXA_ENABLED);
    log("Firefox Accounts is " + (this._fxaEnabled ? "" : "not") + " enabled");
  } catch (ex) {
    log("Firefox Accounts is not enabled; Defaulting to Persona");
    this._fxaEnabled = false;
    return;
  }

  // Firefox Accounts assertions are limited only to certified apps for now.
  try {
    this._allowFxANonCertified =
      this._fxaEnabled &&
      Services.prefs.getPrefType(PREF_ALLOW_FXA) == Ci.nsIPrefBranch.PREF_BOOL
      && Services.prefs.getBoolPref(PREF_ALLOW_FXA);
    log("Firefox Accounts is " + (this._allowFxANonCertified ?
                                  "available for all apps"   :
                                  "only available for certified apps"));
  } catch (ex) {
    log("Firefox Accounts is only available for certified apps.");
    this._allowFxANonCertified = false;
  }

  // RPs are required to specify the 'wantIssuer: <fxaissuer>' option to get
  // Firefox Accounts assertions. The specific required issuer can be changed
  // via identity.fxaccounts.issuer preference.
  try {
    if (Services.prefs.getPrefType(PREF_FXA_ISSUER) ==
        Ci.nsIPrefBranch.PREF_STRING) {
      this._fxaIssuer = Services.prefs.getStringPref(PREF_FXA_ISSUER);
    } else {
      this._fxaIssuer = DEFAULT_FXA_ISSUER;
    }
  } catch (ex) {
    this._fxaIssuer = DEFAULT_FXA_ISSUER;
  }

}

IDService.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIObserver]),

  observe: function observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "quit-application-granted":
        Services.obs.removeObserver(this, "quit-application-granted");
        break;
    }
  },

  getDelegate: function getDelegate(aRpId) {
    // Select the correct identity service delegate for the RP.
    // Firefox Accounts or Persona.
    let rp = this._rpFlows[aRpId];
    if (!rp) {
      throw new Error("No flow for rp " + aRpId);
    }

    if (rp.wantIssuer == "firefox-accounts") {
      log("want fxa");
      if (!this._fxaEnabled) {
        log("Firefox accounts is not enabled; Defaulting to Persona");
        return this._delegates["persona"];
      }
      if (rp.appStatus < Ci.nsIPrincipal.APP_STATUS_CERTIFIED &&
          !this._allowFxANonCertified) {
        delete this._rpFlows[aRpId];
        throw new Error("Non certified apps are not allowed to get " +
                        "Firefox Accounts assertions");
      }
      return this._delegates["firefox-accounts"];
    } 
    return this._delegates["persona"];
  },

  /**
   * Register a listener for a given windowID as a result of a call to
   * navigator.id.watch().
   *
   * @param aCaller
   *        (Object)  an object that represents the caller document, and
   *                  is expected to have properties:
   *                  - id (unique, e.g. uuid)
   *                  - loggedInUser (string or null)
   *                  - appStatus (number)
   *                  - wantIssuer (string) (optional)
   *                  - loggedInUser (string or null) (deprecated)
   *                  - origin (string)
   *
   *                  and a bunch of callbacks
   *                  - doReady()
   *                  - doLogin()
   *                  - doLogout()
   *                  - doError()
   *                  - doCancel()
   *
   *
   * The parameters 'id', 'origin', and 'appStatus' are always set by
   * nsDOMIdentity.js.  Any values the caller provides to these will
   * always be overwritten.
   *
   * appStatus reports the privileges of the principal that invoked the
   * DOM API.  Possible values are:
   *   0: APP_STATUS_NOT_INSTALLED
   *   1: APP_STATUS_INSTALLED
   *   2: APP_STATUS_PRIVILEGED
   *   3: APP_STATUS_CERTIFIED
   */
  watch: function watch(aRpCaller) {
    // Store the caller structure.
    log("watch: " + JSON.stringify(aRpCaller));
    this._rpFlows[aRpCaller.id] = aRpCaller;

    log("current flows: ", Object.keys(this._rpFlows).join(', '));

    log("watch: " + JSON.stringify(aRpCaller));
    this.getDelegate(aRpCaller.id).watch(aRpCaller);
  },

  /*
   * The RP has gone away; remove handles to the hidden iframe.
   * It's probable that the frame will already have been cleaned up.
   */
  unwatch: function unwatch(aRpId, aTargetMM) {
    let rp = this._rpFlows[aRpId];
    if (!rp) {
      return;
    }

    this.getDelegate(aRpId).unwatch(rp, aTargetMM);

    // Stop sending messages to this window
    delete this._rpFlows[aRpId];
  },

  /**
   * Initiate a login with user interaction as a result of a call to
   * navigator.id.request().
   *
   * @param aRPId
   *        (integer)  the id of the doc object obtained in .watch()
   *
   * @param aOptions
   *        (Object)  options including privacyPolicy, termsOfService
   */
  request: function request(aRpId, aOptions) {
    let rp = this._rpFlows[aRpId];
    if (!rp) {
      reportError("request() called before watch()");
      return;
    }

    this.getDelegate(aRpId).request(rp, aOptions);
  },

  /**
   * Invoked when a user wishes to logout of a site (for instance, when clicking
   * on an in-content logout button).
   *
   * @param aRpCallerId
   *        (integer)  the id of the doc object obtained in .watch()
   *
   */
  logout: function logout(aRpId) {
    let rp = this._rpFlows[aRpId];
    if (!rp) {
      reportError("logout() called before watch()");
      return;
    }

    this.getDelegate(aRpId).logout(rp);
  },

  childProcessShutdown: function childProcessShutdown(messageManager) {
    let options = makeMessageObject({messageManager: messageManager, id: null, origin: null});
    Services.obs.notifyObservers({wrappedJSObject: options}, "identity-child-process-shutdown", null);
    Object.keys(this._rpFlows).forEach(function(key) {
      if (this._rpFlows[key]._mm === messageManager) {
        log("child process shutdown for rp", key, "- deleting flow");
        delete this._rpFlows[key];
      }
    }, this);
  },

  /*
   * once the UI-and-display-logic components have received
   * notifications, they call back with direct invocation of the
   * following functions (doLogin, doLogout, or doReady)
   */

  doLogin: function doLogin(aRpCallerId, aAssertion, aInternalParams) {
    let rp = this._rpFlows[aRpCallerId];
    if (!rp) {
      dump("WARNING: doLogin found no rp to go with callerId " +
           aRpCallerId + "\n");
      return;
    }

    rp.doLogin(aAssertion, aInternalParams);
  },

  doLogout: function doLogout(aRpCallerId) {
    let rp = this._rpFlows[aRpCallerId];
    if (!rp) {
      dump("WARNING: doLogout found no rp to go with callerId " + aRpCallerId + "\n");
      return;
    }

    // Logout from every site with the same origin
    let origin = rp.origin;
    Object.keys(this._rpFlows).forEach(function(key) {
      let rp = this._rpFlows[key];
      if (rp.origin === origin) {
        rp.doLogout();
      }
    }.bind(this));
  },

  doReady: function doReady(aRpCallerId) {
    let rp = this._rpFlows[aRpCallerId];
    if (!rp) {
      dump("WARNING: doReady found no rp to go with callerId " + aRpCallerId + "\n");
      return;
    }

    rp.doReady();
  },

  doCancel: function doCancel(aRpCallerId) {
    let rp = this._rpFlows[aRpCallerId];
    if (!rp) {
      dump("WARNING: doCancel found no rp to go with callerId " + aRpCallerId + "\n");
      return;
    }

    rp.doCancel();
  }
};

this.IdentityService = new IDService();
