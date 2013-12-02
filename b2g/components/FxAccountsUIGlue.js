/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict"

const { interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ObjectWrapper.jsm");
Cu.import("resource://gre/modules/Promise.jsm");
Cu.import("resource://gre/modules/FxAccountsCommon.js");

XPCOMUtils.defineLazyServiceGetter(this, "uuidgen",
                                   "@mozilla.org/uuid-generator;1",
                                   "nsIUUIDGenerator");

function FxAccountsUIGlue() {
}

FxAccountsUIGlue.prototype = {

  _browser: Services.wm.getMostRecentWindow("navigator:browser"),

  _sendChromeEvent: function(aMsg) {
    log("Chrome event ", aMsg);
    let content = this._browser.getContentWindow();
    if (!content) {
      return;
    }

    let event = content.document.createEvent("CustomEvent");
    event.initCustomEvent("mozFxAccountsRPChromeEvent", true, true,
                          aMsg ? ObjectWrapper.wrap(aMsg, content) : {});
    content.dispatchEvent(event);

    return aMsg.id;
  },

  signInFlow: function() {
    let deferred = Promise.defer();

    let content = this._browser.getContentWindow();
    if (!content) {
      deferred.reject("INTERNAL_ERROR_NO_CONTENT");
      return;
    }

    let id = uuidgen.generateUUID().toString();

    content.addEventListener("mozFxAccountsRPContentEvent", function(result) {
      let msg = result.detail;
      if (!msg || !msg.id) {
        deferred.reject("INTERNAL_ERROR_NO_RESULT");
        return;
      }

      log("Got content event ", msg);

      if (msg.id != id) {
        return;
      }

      if (msg.error) {
        deferred.reject(msg);
      } else {
        deferred.resolve(msg.result);
      }
    });

    this._sendChromeEvent({
      method: "openFlow",
      id: id
    });

    return deferred.promise;
  },

  classID: Components.ID("{51875c14-91d7-4b8c-b65d-3549e101228c}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFxAccountsUIGlue])
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([FxAccountsUIGlue]);
