/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Some specific (certified) apps need to get access to certain Firefox Accounts
 * functionality that allows them to manage accounts (this is mostly sign up,
 * sign in, logout and delete) and get information about the currently existing
 * ones.
 *
 * This service listens for requests coming from these apps, triggers the
 * appropriate Fx Accounts flows and send reponses back to the UI.
 *
 * The communication mechanism is based in mozFxAccountsContentEvent (for
 * messages coming from the UI) and mozFxAccountsChromeEvent (for messages
 * sent from the chrome side) custom events.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FxAccountsMgmtService"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/ObjectWrapper.jsm");
Cu.import("resource://gre/modules/FxAccountsCommon.js");

XPCOMUtils.defineLazyModuleGetter(this, "FxAccountsManager",
  "resource://gre/modules/FxAccountsManager.jsm");

this.FxAccountsMgmtService = {

  _browser: Services.wm.getMostRecentWindow("navigator:browser"),

  _sendChromeEvent: function(aMsg) {
    log("Chrome event ", aMsg);
    let content = this._browser.getContentWindow();
    let event = content.document.createEvent("CustomEvent");
    event.initCustomEvent("mozFxAccountsChromeEvent", true, true,
                          aMsg ? ObjectWrapper.wrap(aMsg, content) : {});
    content.dispatchEvent(event);
  },

  _onFullfill: function(aMsgId, aData) {
    FxAccountsMgmtService._sendChromeEvent({
      id: aMsgId,
      data: aData ? aData : null
    });
  },

  _onReject: function(aMsgId, aReason) {
    FxAccountsMgmtService._sendChromeEvent({
      id: aMsgId,
      error: aReason ? aReason : null
    });
  },

  handleEvent: function(aEvent) {
    let msg = aEvent.detail;
    log("Got content msg ", msg);
    let self = FxAccountsMgmtService;

    if (!msg.id) {
      return;
    }

    let data = msg.data;
    switch(data.method) {
      case "getAccounts":
        FxAccountsManager.getAccount().then(
          account => {
            // We only expose the email and verification status so far.
            this._onFullfill(msg.id, account);
          },
          reason => {
            this._onReject(msg.id, reason);
          }
        ).then(null, Components.utils.reportError);
        break;
      case "logout":
        FxAccountsManager.signOut().then(
          () => {
            this._onFullfill(msg.id);
          },
          reason => {
            this._onReject(msg.id, reason);
          }).then(null, Components.utils.reportError);
        break;
      case "queryAccount":
        FxAccountsManager.queryAccount(data.accountId).then(
          result => {
            this._onFullfill(msg.id, result);
          },
          reason => {
            this._onReject(msg.id, reason);
          }
        );
        break;
      case "signIn":
      case "signUp":
        FxAccountsManager[data.method](data.accountId, data.password).then(
          user => {
            this._onFullfill(msg.id, user);
          },
          reason => {
            this._onReject(msg.id, reason);
          }
        );
        break;
    }
  }

};
