/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Temporary abstraction layer for common Fx Accounts operations.
 * For now, we will be using this module only from B2G but in the end we might
 * want this to be merged with FxAccounts.jsm and let other products also use
 * it.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FxAccountsManager"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FxAccounts.jsm");
Cu.import("resource://gre/modules/Promise.jsm");
Cu.import("resource://gre/modules/FxAccountsCommon.js");

XPCOMUtils.defineLazyModuleGetter(this, "FxAccountsClient",
  "resource://gre/modules/FxAccountsClient.jsm");

this.FxAccountsManager = {

  // We don't really need to save fxAccounts instance but this way we allow
  // to mock FxAccounts from tests.
  _fxAccounts: fxAccounts,

  // We keep the session details here so consumers don't need to deal with
  // session tokens and are only required to handle the email.
  _activeSession: null,

  // We only expose the email and the verified status so far.
  get _user() {
    if (!this._activeSession || !this._activeSession.email) {
      return null;
    }

    return {
      accountId: this._activeSession.email,
      verified: this._activeSession.verified
    }
  },

  _getError: function(aServerResponse) {
    if (!aServerResponse || !aServerResponse.error || !aServerResponse.error.errno) {
      return;
    }
    let error = SERVER_ERRNO_TO_ERROR[aServerResponse.error.errno];
    log(error);
    return error;
  },

  _serverError: function(aServerResponse) {
    let error = this._getError({ error: aServerResponse });
    return Promise.reject({
      error: error ? error : ERROR_SERVER_ERROR,
      details: aServerResponse
    });
  },

  // As we do with _fxAccounts, we don't really need this factory, but this way
  // we allow tests to mock FxAccountsClient.
  _createFxAccountsClient: function() {
    return new FxAccountsClient();
  },

  _signInSignUp: function(aMethod, aAccountId, aPassword) {
    if (Services.io.offline) {
      log(ERROR_OFFLINE);
      return Promise.reject({
        error: ERROR_OFFLINE
      });
    }

    if (!aAccountId) {
      log(ERROR_INVALID_ACCOUNTID);
      return Promise.reject({
        error: ERROR_INVALID_ACCOUNTID
      });
    }

    if (!aPassword) {
      log(ERROR_INVALID_PASSWORD);
      return Promise.reject({
        error: ERROR_INVALID_PASSWORD
      });
    }

    // Check that there is no signed in account first.
    if (this._activeSession) {
      log(ERROR_ALREADY_SIGNED_IN_USER);
      return Promise.reject({
        error: ERROR_ALREADY_SIGNED_IN_USER,
        details: {
          user: this._user
        }
      });
    }

    let client = this._createFxAccountsClient();
    return this._fxAccounts.getSignedInUser().then(
      user => {
        if (user) {
          log(ERROR_ALREADY_SIGNED_IN_USER);
          return Promise.reject({
            error: ERROR_ALREADY_SIGNED_IN_USER,
            details: {
              user: user
            }
          });
        }
        return client[aMethod](aAccountId, aPassword);
      }
    ).then(
      user => {
        let error = this._getError(user);
        if (!user || !user.uid || !user.sessionToken || error) {
          log(error ? error : ERROR_INTERNAL_INVALID_USER);
          return Promise.reject({
            error: error ? error : ERROR_INTERNAL_INVALID_USER,
            details: {
              user: user
            }
          });
        }

        // Save the credentials of the signed in user.
        user.email = aAccountId;
        return this._fxAccounts.setSignedInUser(user, false).then(
          () => {
            this._activeSession = user;
            log("User signed in: ", this._user, " - Account created ",
                (aMethod == "signUp"));
            return Promise.resolve({
              accountCreated: aMethod === "signUp",
              user: this._user
            });
          }
        );
      },
      reason => { return this._serverError(reason); }
    );
  },

  _getAssertion: function(aAudience) {
    return this._fxAccounts.getAssertion(aAudience);
  },

  // -- API --

  signIn: function(aAccountId, aPassword) {
    log("signIn with ", aAccountId);
    return this._signInSignUp("signIn", aAccountId, aPassword);
  },

  signUp: function(aAccountId, aPassword) {
    log("signUp with ", aAccountId);
    return this._signInSignUp("signUp", aAccountId, aPassword);
  },

  signOut: function() {
    log("signOut");
    if (Services.io.offline) {
      log(ERROR_OFFLINE);
      return Promise.reject({
        error: ERROR_OFFLINE
      });
    }

    if (!this._activeSession) {
      log("No active session");
      return Promise.resolve();
    }

    let client = this._createFxAccountsClient();
    return client.signOut(this._activeSession.sessionToken).then(
      result => {
        let error = this._getError(result);
        if (error) {
          return Promise.reject({
            error: error,
            details: result
          });
        }
        return this._fxAccounts.signOut(this._activeSession.sessionToken).then(
          () => {
            log("Signed out");
            this._activeSession = null;
            return Promise.resolve();
          }
        );
      },
      reason => { return this._serverError(reason); }
    );
  },

  getAccount: function() {
    // We check first if we have session details cached.
    if (this._activeSession) {
      // If our cache says that the account is not yet verified, we check that
      // this information is correct, and update the cached data if not.
      if (this._activeSession && !this._activeSession.verified &&
          !Services.io.offline) {
        return this.verificationStatus(this._activeSession);
      }

      log("Account ", this._user);
      return Promise.resolve(this._user);
    }

    // If no cached information, we try to get it from the persistent storage.
    return this._fxAccounts.getSignedInUser().then(
      user => {
        if (!user || !user.email) {
          log("No signed in account");
          return Promise.resolve(null);
        }

        this._activeSession = user;
        // If we get a stored information of a not yet verified account,
        // we check this information with the server, update the stored
        // data if needed and finally return the account details.
        if (!user.verified && !Services.io.offline) {
          log("Unverified account");
          return this.verificationStatus(user);
        }

        log("Account ", this._user);
        return Promise.resolve(this._user);
      }
    );
  },

  queryAccount: function(aAccountId) {
    log("queryAccount ", aAccountId);
    if (Services.io.offline) {
      log(ERROR_OFFLINE);
      return Promise.reject({
        error: ERROR_OFFLINE
      });
    }

    let deferred = Promise.defer();

    if (!aAccountId) {
      log(ERROR_INVALID_ACCOUNTID);
      return Promise.reject({
        error: ERROR_INVALID_ACCOUNTID
      });
    }

    let client = this._createFxAccountsClient();
    return client.accountExists(aAccountId).then(
      result => {
        log("Account exists ", result);
        let error = this._getError(result);
        if (error) {
          return Promise.reject({
            error: error,
            details: result
          });
        }

        return Promise.resolve({
          registered: result
        });
      },
      reason => { this._serverError(reason); }
    );
  },

  verificationStatus: function() {
    log("verificationStatus");
    if (!this._activeSession || !this._activeSession.sessionToken) {
      log(ERROR_NO_TOKEN_SESSION);
      return Promise.reject({
        error: ERROR_NO_TOKEN_SESSION
      });
    }

    // There is no way to unverify an already verified account, so we just
    // return the account details of a verified account
    if (this._activeSession.verified) {
      log("Account already verified");
      return Promise.resolve(this._user);
    }

    if (Services.io.offline) {
      log(ERROR_OFFLINE);
      return Promise.reject({
        error: ERROR_OFFLINE
      });
    }

    let client = this._createFxAccountsClient();
    return client.recoveryEmailStatus(this._activeSession.sessionToken).then(
      data => {
        let error = this._getError(data);
        if (error) {
          return Promise.reject({
            error: error,
            details: data
          });
        }

        // If the verification status is different from the one that we have
        // stored, we update it and return the session data. If not, we simply
        // return the session data.
        if (this._activeSession.verified != data.verified) {
          this._activeSession.verified = data.verified;
          return this._fxAccounts.setSignedInUser(this._activeSession).then(
            () => {
              log(this._user);
              return Promise.resolve(this._user);
            }
          );
        }
        log(this._user);
        return Promise.resolve(this._user);
      },
      reason => { return this._serverError(reason); }
    );
  },

  getAssertion: function(aAudience) {
    log("getAssertion ", aAudience);
    if (!aAudience) {
      log(ERROR_OFFLINE);
      return Promise.reject({
        error: ERROR_INVALID_AUDIENCE
      });
    }

    if (Services.io.offline) {
      log(ERROR_OFFLINE);
      return Promise.reject({
        error: ERROR_OFFLINE
      });
    }

    return this.getAccount().then(
      user => {
        if (user) {
          // We cannot get assertions for unverified accounts.
          if (user.verified) {
            return this._getAssertion(aAudience);
          }

          log(ERROR_UNVERIFIED_ACCOUNT);
          return Promise.reject({
            error: ERROR_UNVERIFIED_ACCOUNT,
            details: {
              user: user
            }
          });
        }

        log("No signed in user");
        // If there is no currently signed in user, we trigger the signIn UI
        // flow.
        let ui = Cc["@mozilla.org/fxaccounts/fxaccounts-ui-glue;1"]
                   .createInstance(Ci.nsIFxAccountsUIGlue);
        return ui.signInFlow().then(
          result => {
            // Even if we get a successful result from the UI, the account will
            // most likely be unverified, so we cannot get an assertion.
            if (result && result.verified) {
              return this._getAssertion(aAudience);
            }

            log(ERROR_UNVERIFIED_ACCOUNT);
            return Promise.reject({
              error: ERROR_UNVERIFIED_ACCOUNT,
              details: {
                user: result
              }
            });
          },
          error => {
            log(ERROR_UI_ERROR, " ", error);
            return Promise.reject({
              error: ERROR_UI_ERROR,
              details: error
            });
          }
        );
      }
    );
  }
};
