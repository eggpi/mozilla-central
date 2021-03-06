/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const INSTALL_LOCALE = "@AB_CD@";
const APP_BIN_NAME = "@MOZ_APP_NAME@";
const BIN_SUFFIX = "@BIN_SUFFIX@";

const APP_INFO_NAME = "XPCShell";
const APP_INFO_VENDOR = "Mozilla";

#ifdef XP_UNIX
const APP_BIN_SUFFIX = "-bin";
#else
const APP_BIN_SUFFIX = "@BIN_SUFFIX@";
#endif

#ifdef XP_WIN
const IS_WIN = true;
#else
const IS_WIN = false;
#endif

#ifdef XP_OS2
const IS_OS2 = true;
#else
const IS_OS2 = false;
#endif

#ifdef XP_MACOSX
const IS_MACOSX = true;
#ifdef MOZ_SHARK
const IS_SHARK = true;
#else
const IS_SHARK = false;
#endif
#else
const IS_MACOSX = false;
#endif

#ifdef XP_UNIX
const IS_UNIX = true;
#else
const IS_UNIX = false;
#endif

#ifdef ANDROID
const IS_ANDROID = true;
#else
const IS_ANDROID = false;
#endif

#ifdef MOZ_WIDGET_GONK
const IS_TOOLKIT_GONK = true;
#else
const IS_TOOLKIT_GONK = false;
#endif

const USE_EXECV = IS_UNIX && !IS_MACOSX;

#ifdef MOZ_VERIFY_MAR_SIGNATURE
const IS_MAR_CHECKS_ENABLED = true;
#else
const IS_MAR_CHECKS_ENABLED = false;
#endif

const URL_HOST = "http://localhost";

const APPLY_TO_DIR_SUFFIX = "_applyToDir/";
const UPDATES_DIR_SUFFIX = "_mar";
#ifdef XP_MACOSX
const UPDATED_DIR_SUFFIX = "Updated.app/";
#else
const UPDATED_DIR_SUFFIX = "updated/";
#endif

const FILE_COMPLETE_MAR = "complete.mar";
const FILE_COMPLETE_WIN_MAR = "complete_win.mar";
const FILE_HELPER_BIN = "TestAUSHelper" + BIN_SUFFIX;
const FILE_MAINTENANCE_SERVICE_BIN = "maintenanceservice.exe";
const FILE_MAINTENANCE_SERVICE_INSTALLER_BIN = "maintenanceservice_installer.exe";
const FILE_OLD_VERSION_MAR = "old_version.mar";
const FILE_PARTIAL_MAR = "partial.mar";
const FILE_PARTIAL_WIN_MAR = "partial_win.mar";
const FILE_UPDATER_BIN = "updater" + BIN_SUFFIX;
const FILE_UPDATER_INI_BAK = "updater.ini.bak";
const FILE_WRONG_CHANNEL_MAR = "wrong_product_channel.mar";

const LOG_COMPLETE_SUCCESS = "complete_log_success";
const LOG_COMPLETE_SWITCH_SUCCESS = "complete_log_switch_success"
const LOG_COMPLETE_CC_SUCCESS = "complete_cc_log_success";
const LOG_COMPLETE_CC_SWITCH_SUCCESS = "complete_cc_log_switch_success";

const LOG_PARTIAL_SUCCESS = "partial_log_success";
const LOG_PARTIAL_SWITCH_SUCCESS = "partial_log_switch_success";
const LOG_PARTIAL_FAILURE = "partial_log_failure";

const ERR_CALLBACK_FILE_IN_USE = "NS_main: file in use - failed to " +
                                 "exclusively open executable file:"

const ERR_RENAME_FILE = "rename_file: failed to rename file";
const ERR_UNABLE_OPEN_DEST = "unable to open destination file";
const ERR_BACKUP_DISCARD = "backup_discard: unable to remove";

const LOG_SVC_SUCCESSFUL_LAUNCH = "Process was started... waiting on result.";

// All we care about is that the last modified time has changed so that Mac OS
// X Launch Services invalidates its cache so the test allows up to one minute
// difference in the last modified time.
const MAC_MAX_TIME_DIFFERENCE = 60000;

// Time to wait for the test helper process before continuing the test
const TEST_HELPER_TIMEOUT = 100;

// Time to wait for a check in the test before continuing the test
const TEST_CHECK_TIMEOUT = 100;

// How many of TEST_CHECK_TIMEOUT to wait before we abort the test.
const MAX_TIMEOUT_RUNS = 1000;

// Maximum number of milliseconds the process that is launched can run before
// the test will try to kill it.
const APP_TIMER_TIMEOUT = 120000;

// Use a copy of the main application executable for the test to avoid main
// executable in use errors.
const FILE_WIN_TEST_EXE = "_aus_test_app.exe";

// This default value will be overridden when using the http server.
var gURLData = URL_HOST + "/";

var gTestID;

var gTestserver;

var gXHR;
var gXHRCallback;

var gUpdatePrompt;
var gUpdatePromptCallback;

var gCheckFunc;
var gResponseBody;
var gResponseStatusCode = 200;
var gRequestURL;
var gUpdateCount;
var gUpdates;
var gStatusCode;
var gStatusText;

// Variables are used instead of contants so tests can override these values
var gCallbackBinFile = "callback_app" + BIN_SUFFIX;
var gCallbackArgs = ["./", "callback.log", "Test Arg 2", "Test Arg 3"];
var gBackgroundUpdate = false;
var gSwitchApp = false;
var gDisableReplaceFallback = false;

var gTimeoutRuns = 0;

/**
 * The mar files used for the updater tests contain the following remove
 * operations.
 *
 * partial and complete test mar remove operations
 * -----------------------------------------------
 * remove "text1"
 * remove "text0"
 * rmrfdir "9/99/"
 * rmdir "9/99/"
 * rmrfdir "9/98/"
 * rmrfdir "9/97/"
 * rmrfdir "9/96/"
 * rmrfdir "9/95/"
 * rmrfdir "9/95/"
 * rmrfdir "9/94/"
 * rmdir "9/94/"
 * rmdir "9/93/"
 * rmdir "9/92/"
 * rmdir "9/91/"
 * rmdir "9/90/"
 * rmdir "9/90/"
 * rmrfdir "8/89/"
 * rmdir "8/89/"
 * rmrfdir "8/88/"
 * rmrfdir "8/87/"
 * rmrfdir "8/86/"
 * rmrfdir "8/85/"
 * rmrfdir "8/85/"
 * rmrfdir "8/84/"
 * rmdir "8/84/"
 * rmdir "8/83/"
 * rmdir "8/82/"
 * rmdir "8/81/"
 * rmdir "8/80/"
 * rmdir "8/80/"
 * rmrfdir "7/"
 * rmdir "6/"
 * remove "5/text1"
 * remove "5/text0"
 * rmrfdir "5/"
 * remove "4/text1"
 * remove "4/text0"
 * remove "4/exe0.exe"
 * rmdir "4/"
 * remove "3/text1"
 * remove "3/text0"
 *
 * partial test mar additional remove operations
 * ---------------------------------------------
 * remove "0/00/00text1"
 * remove "1/10/10text0"
 * rmdir "1/10/"
 * rmdir "1/"
 */
var TEST_DIRS = [
{
  relPathDir   : "a/b/3/",
  dirRemoved   : false,
  files        : ["3text0", "3text1"],
  filesRemoved : true
}, {
  relPathDir   : "a/b/4/",
  dirRemoved   : true,
  files        : ["4text0", "4text1"],
  filesRemoved : true
}, {
  relPathDir   : "a/b/5/",
  dirRemoved   : true,
  files        : ["5test.exe", "5text0", "5text1"],
  filesRemoved : true
}, {
  relPathDir   : "a/b/6/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/7/",
  dirRemoved   : true,
  files        : ["7text0", "7text1"],
  subDirs      : ["70/", "71/"],
  subDirFiles  : ["7xtest.exe", "7xtext0", "7xtext1"]
}, {
  relPathDir   : "a/b/8/",
  dirRemoved   : false
}, {
  relPathDir   : "a/b/8/80/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/8/81/",
  dirRemoved   : false,
  files        : ["81text0", "81text1"]
}, {
  relPathDir   : "a/b/8/82/",
  dirRemoved   : false,
  subDirs      : ["820/", "821/"]
}, {
  relPathDir   : "a/b/8/83/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/8/84/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/8/85/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/8/86/",
  dirRemoved   : true,
  files        : ["86text0", "86text1"]
}, {
  relPathDir   : "a/b/8/87/",
  dirRemoved   : true,
  subDirs      : ["870/", "871/"],
  subDirFiles  : ["87xtext0", "87xtext1"]
}, {
  relPathDir   : "a/b/8/88/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/8/89/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/9/90/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/9/91/",
  dirRemoved   : false,
  files        : ["91text0", "91text1"]
}, {
  relPathDir   : "a/b/9/92/",
  dirRemoved   : false,
  subDirs      : ["920/", "921/"]
}, {
  relPathDir   : "a/b/9/93/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/9/94/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/9/95/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/9/96/",
  dirRemoved   : true,
  files        : ["96text0", "96text1"]
}, {
  relPathDir   : "a/b/9/97/",
  dirRemoved   : true,
  subDirs      : ["970/", "971/"],
  subDirFiles  : ["97xtext0", "97xtext1"]
}, {
  relPathDir   : "a/b/9/98/",
  dirRemoved   : true
}, {
  relPathDir   : "a/b/9/99/",
  dirRemoved   : true
}];

// Populated by tests if needed.
var ADDITIONAL_TEST_DIRS = [];

// Set to true to log additional information for debugging. To log additional
// information for an individual test set DEBUG_AUS_TEST to true in the test's
// run_test function.
var DEBUG_AUS_TEST = true;

#include ../shared.js

#ifdef MOZ_MAINTENANCE_SERVICE
const STATE_APPLIED_PLATFORM = STATE_APPLIED_SVC;
#else
const STATE_APPLIED_PLATFORM = STATE_APPLIED;
#endif

// This makes it possible to run most tests on xulrunner where the update
// channel default preference is not set.
if (APP_BIN_NAME == "xulrunner") {
  try {
    gDefaultPrefBranch.getCharPref(PREF_APP_UPDATE_CHANNEL);
  }
  catch (e) {
    setUpdateChannel("test_channel");
  }
}

function setupTestCommon(aAdjustGeneralPaths) {
  do_test_pending();

  if (gTestID) {
    do_throw("should only be called once!");
  }

  let caller = Components.stack.caller;
  gTestID = caller.filename.toString().split("/").pop().split(".")[0];

  if (aAdjustGeneralPaths) {
     // adjustGeneralPaths registers a cleanup function that calls end_test.
     adjustGeneralPaths();
  }

  removeUpdateDirsAndFiles();
}

/**
 * Nulls out the most commonly used global vars used by tests as appropriate.
 */
function cleanupTestCommon() {
  logTestInfo("start - general test cleanup");
  removeUpdateDirsAndFiles();

  // Force the update manager to reload the update data to prevent it from
  // writing the old data to the files that have just been removed.
  reloadUpdateManagerData();

  if (gChannel) {
    gPrefRoot.removeObserver(PREF_APP_UPDATE_CHANNEL, observer);
  }

  // Call app update's observe method passing xpcom-shutdown to test that the
  // shutdown of app update runs without throwing or leaking. The observer
  // method is used directly instead of calling notifyObservers so components
  // outside of the scope of this test don't assert and thereby cause app update
  // tests to fail.
  gAUS.observe(null, "xpcom-shutdown", "");

  if (gXHR) {
    gXHRCallback     = null;

    gXHR.responseXML = null;
    // null out the event handlers to prevent a mFreeCount leak of 1
    gXHR.onerror     = null;
    gXHR.onload      = null;
    gXHR.onprogress  = null;

    gXHR             = null;
  }

  gTestserver = null;
  logTestInfo("finish - general test cleanup");
}

/**
 * Sets the most commonly used preferences used by tests
 */
function setDefaultPrefs() {
  Services.prefs.setBoolPref(PREF_APP_UPDATE_ENABLED, true);
  Services.prefs.setBoolPref(PREF_APP_UPDATE_METRO_ENABLED, true);
  // Don't display UI for a successful installation. Some apps may not set this
  // pref to false like Firefox does.
  Services.prefs.setBoolPref(PREF_APP_UPDATE_SHOW_INSTALLED_UI, false);
  // Enable Update logging
  Services.prefs.setBoolPref(PREF_APP_UPDATE_LOG, true);
}

/**
 * Initializes the most commonly used settings and creates an instance of the
 * update service stub.
 */
function standardInit() {
  createAppInfo("xpcshell@tests.mozilla.org", APP_INFO_NAME, "1.0", "2.0");
  setDefaultPrefs();
  // Initialize the update service stub component
  initUpdateServiceStub();
}

/* Custom path handler for the http server */
function pathHandler(metadata, response) {
  response.setHeader("Content-Type", "text/xml", false);
  response.setStatusLine(metadata.httpVersion, gResponseStatusCode, "OK");
  response.bodyOutputStream.write(gResponseBody, gResponseBody.length);
}

/**
 * Helper function for getting the relative path to the directory where the
 * update will be applied.
 *
 * The main files in the update are located two directories below the apply to
 * directory since Mac OS X sets the last modified time for the root directory
 * to the current time and if the update changes any files in the root directory
 * then it wouldn't be possible to test (bug 600098).
 *
 * @return  The relative path to the directory where the update will be applied.
 */
function getApplyDirPath() {
  return gTestID + APPLY_TO_DIR_SUFFIX + "appdir/";
}

/**
 * Helper function for getting the nsIFile for a file in the directory where the
 * update will be applied.
 *
 * The files for the update are located two directories below the apply to
 * directory since Mac OS X sets the last modified time for the root directory
 * to the current time and if the update changes any files in the root directory
 * then it wouldn't be possible to test (bug 600098).
 *
 * @return  The nsIFile for the file in the directory where the update will be
 *          applied.
 */
function getApplyDirFile(aRelPath, allowNonexistent) {
  let relpath = getApplyDirPath() + (aRelPath ? aRelPath : "");
  return do_get_file(relpath, allowNonexistent);
}

/**
 * Helper function for getting the relative path to the directory where the
 * test data files are located.
 *
 * @return  The relative path to the directory where the test data files are
 *          located.
 */
function getTestDirPath() {
  return "../data/";
}

/**
 * Helper function for getting the nsIFile for a file in the test data
 * directory.
 *
 * @return  The nsIFile for the file in the test data directory.
 */
function getTestDirFile(aRelPath) {
  let relpath = getTestDirPath() + (aRelPath ? aRelPath : "");
  return do_get_file(relpath, false);
}

/**
 * Helper function for getting the updated directory.
 */
function getUpdatedDirPath() {
  let suffix = "";
  if (gBackgroundUpdate) {
    suffix = UPDATED_DIR_SUFFIX;
  }
  return getApplyDirPath() + suffix;
}

/**
 * Helper function for getting the nsIFile for the directory where the update
 * has been applied.
 *
 * This will be the same as getApplyDirFile for foreground updates, but will
 * point to a different file for the case of background updates.
 *
 * Functions which attempt to access the files in the updated directory should
 * be using this instead of getApplyDirFile.
 *
 * @return  The nsIFile for the directory where the update has been applied.
 */
function getTargetDirFile(aRelPath, allowNonexistent) {
  let relpath = getUpdatedDirPath() + (aRelPath ? aRelPath : "");
  return do_get_file(relpath, allowNonexistent);
}

if (IS_WIN) {
  const kLockFileName = "updated.update_in_progress.lock";
  /**
   * Helper function for locking a directory on Windows.
   */
  function lockDirectory(aDir) {
    var file = aDir.clone();
    file.append(kLockFileName);
    file.create(file.NORMAL_FILE_TYPE, 4 * 64 + 4 * 8 + 4); // 0444
    file.QueryInterface(AUS_Ci.nsILocalFileWin);
    file.fileAttributesWin |= file.WFA_READONLY;
    file.fileAttributesWin &= ~file.WFA_READWRITE;
    logTestInfo("testing the successful creation of the lock file");
    do_check_true(file.exists());
    do_check_false(file.isWritable());
  }
  /**
   * Helper function for unlocking a directory on Windows.
   */
  function unlockDirectory(aDir) {
    var file = aDir.clone();
    file.append(kLockFileName);
    file.QueryInterface(AUS_Ci.nsILocalFileWin);
    file.fileAttributesWin |= file.WFA_READWRITE;
    file.fileAttributesWin &= ~file.WFA_READONLY;
    logTestInfo("removing and testing the successful removal of the lock file");
    file.remove(false);
    do_check_false(file.exists());
  }
}

/**
 * Copies the minimum files required by the application to be able to process
 * an application update when the application is launched for a test.
 *
 * @param  aSrcDir
 *         nsIFile for the source directory to be copied from.
 * @param  aDestDir
 *         nsIFile for the destination directory parent.
 * @param  aDestLeafName
 *         the destination directory name.
 */
function copyMinimumAppFiles(aSrcDir, aDestDir, aDestLeafName) {
  let destDir = aDestDir.clone();
  destDir.append(aDestLeafName);
  if (!destDir.exists()) {
    try {
      destDir.create(AUS_Ci.nsIFile.DIRECTORY_TYPE, PERMS_DIRECTORY);
    }
    catch (e) {
      logTestInfo("unable to create directory, path: " + destDir.path +
                  ", exception: " + e);
      do_throw(e);
    }
  }

  // Required files for the application or the test that aren't listed in the
  // dependentlibs.list file.
  let fileLeafNames = [APP_BIN_NAME + APP_BIN_SUFFIX, FILE_UPDATER_BIN,
                       FILE_UPDATE_SETTINGS_INI, "application.ini",
                       "dependentlibs.list"];

  // Read the dependent libs file leafnames from the dependentlibs.list file
  // into the array.
  let deplibsFile = aSrcDir.clone();
  deplibsFile.append("dependentlibs.list");
  let istream = AUS_Cc["@mozilla.org/network/file-input-stream;1"].
                createInstance(AUS_Ci.nsIFileInputStream);
  istream.init(deplibsFile, 0x01, 4 * 64 + 4 * 8 + 4, 0); // 0444
  istream.QueryInterface(AUS_Ci.nsILineInputStream);

  let hasMore;
  let line = {};
  do {
    hasMore = istream.readLine(line);
    fileLeafNames.push(line.value);
  } while(hasMore);

  istream.close();

  fileLeafNames.forEach(function CMAF_FLN_FE(aLeafName) {
    let srcFile = aSrcDir.clone();
    srcFile.append(aLeafName);
    try {
      srcFile.copyTo(destDir, aLeafName);
    }
    catch (e) {
      logTestInfo("unable to copy file, src path: " + srcFile.path +
                  ", dest path: " + destFile.path + ", exception: " + e);
      do_throw(e);
    }
  });
}

/**
 * Helper function for updater tests for launching the updater binary to apply
 * a mar file.
 *
 * @return  The exit value returned from the updater binary.
 */
function runUpdate() {
  // Copy the updater binary to the updates directory.
  let binDir = getGREDir();
  let updater = binDir.clone();
  updater.append("updater.app");
  if (!updater.exists()) {
    updater = binDir.clone();
    updater.append(FILE_UPDATER_BIN);
    if (!updater.exists()) {
      do_throw("Unable to find updater binary!");
    }
  }

  let updatesDir = do_get_file(gTestID + UPDATES_DIR_SUFFIX, true);
  updater.copyTo(updatesDir, updater.leafName);
  let updateBin = updatesDir.clone();
  updateBin.append(updater.leafName);
  if (updateBin.leafName == "updater.app") {
    updateBin.append("Contents");
    updateBin.append("MacOS");
    updateBin.append("updater");
    if (!updateBin.exists())
      do_throw("Unable to find the updater executable!");
  }

  let updatesDirPath = updatesDir.path;
  if (/ /.test(updatesDirPath))
    updatesDirPath = '"' + updatesDirPath + '"';

  let applyToDir = getApplyDirFile();
  let applyToDirPath = applyToDir.path;
  if (gBackgroundUpdate || gSwitchApp) {
    applyToDirPath += "/" + UPDATED_DIR_SUFFIX;
  }
  if (IS_WIN) {
    // Convert to native path
    applyToDirPath = applyToDirPath.replace(/\//g, "\\");
  }
  if (/ /.test(applyToDirPath))
    applyToDirPath = '"' + applyToDirPath + '"';

  let callbackApp = getApplyDirFile("a/b/" + gCallbackBinFile);
  callbackApp.permissions = PERMS_DIRECTORY;

  let cwdPath = callbackApp.parent.path;
  if (/ /.test(cwdPath))
    cwdPath = '"' + cwdPath + '"';

  let callbackAppPath = callbackApp.path;
  if (/ /.test(callbackAppPath))
    callbackAppPath = '"' + callbackAppPath + '"';

  // Backup the updater-settings.ini file if it exists by moving it.
  let updateSettingsIni = getApplyDirFile(null, true);
  updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
  if (updateSettingsIni.exists()) {
    updateSettingsIni.moveTo(updateSettingsIni.parent, FILE_UPDATE_SETTINGS_INI_BAK);
  }
  updateSettingsIni = getApplyDirFile(null, true);
  updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
  writeFile(updateSettingsIni, UPDATE_SETTINGS_CONTENTS);

  let args = [updatesDirPath, applyToDirPath, 0];
  if (gBackgroundUpdate) {
    args[2] = -1;
  } else {
    if (gSwitchApp) {
      args[2] = "0/replace";
    }
    args = args.concat([cwdPath, callbackAppPath]);
    args = args.concat(gCallbackArgs);
  }
  logTestInfo("Running the updater: " + updateBin.path + " " + args.join(" "));

  let env = AUS_Cc["@mozilla.org/process/environment;1"].
            getService(AUS_Ci.nsIEnvironment);
  if (gDisableReplaceFallback) {
    env.set("MOZ_NO_REPLACE_FALLBACK", "1");
  }

  let process = AUS_Cc["@mozilla.org/process/util;1"].
                createInstance(AUS_Ci.nsIProcess);
  process.init(updateBin);
  process.run(true, args, args.length);

  if (gDisableReplaceFallback) {
    env.set("MOZ_NO_REPLACE_FALLBACK", "");
  }

  // Restore the backed up updater-settings.ini if it exists.
  let updateSettingsIni = getApplyDirFile(null, true);
  updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI_BAK);
  if (updateSettingsIni.exists()) {
    updateSettingsIni.moveTo(updateSettingsIni.parent, FILE_UPDATE_SETTINGS_INI);
  }

  return process.exitValue;
}

let gServiceLaunchedCallbackLog = null;
let gServiceLaunchedCallbackArgs = null;

/**
 * Helper function to check whether the maintenance service updater tests should
 * run. See bug 711660 for more details.
 *
 * @return true if the test should run and false if it shouldn't.
 */
function shouldRunServiceTest(aFirstTest) {
  // In case the machine is running an old maintenance service or if it
  // is not installed, and permissions exist to install it.  Then install
  // the newer bin that we have.
  attemptServiceInstall();

  const REG_PATH = "SOFTWARE\\Mozilla\\MaintenanceService\\" +
                   "3932ecacee736d366d6436db0f55bce4";

  let key = AUS_Cc["@mozilla.org/windows-registry-key;1"].
            createInstance(AUS_Ci.nsIWindowsRegKey);
  try {
    key.open(AUS_Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE, REG_PATH,
             AUS_Ci.nsIWindowsRegKey.ACCESS_READ | key.WOW64_64);
  }
  catch (e) {
    logTestInfo("this test can only run on the buildbot build system at this " +
                "time.");
    return false;
  }

  let binDir = getGREDir();
  let updaterBin = binDir.clone();
  updaterBin.append(FILE_UPDATER_BIN);
  if (!updaterBin.exists()) {
    do_throw("Unable to find updater binary!");
  }

  let updaterBinPath = updaterBin.path;
  if (/ /.test(updaterBinPath)) {
    updaterBinPath = '"' + updaterBinPath + '"';
  }

  // Check to make sure the service is installed
  let helperBin = getTestDirFile(FILE_HELPER_BIN);
  let args = ["wait-for-service-stop", "MozillaMaintenance", "10"];
  let process = AUS_Cc["@mozilla.org/process/util;1"].
                createInstance(AUS_Ci.nsIProcess);
  process.init(helperBin);
  logTestInfo("Checking if the service exists on this machine.");
  process.run(true, args, args.length);
  if (process.exitValue == 0xEE) {
    logTestInfo("this test can only run when the service is installed.");
    return false;
  } else {
    logTestInfo("Service exists, return value: " + process.exitValue);
  }

  // If this is the first test in the series, then there is no reason the
  // service should be anything but stopped, so be strict here and throw
  // an error.
  if (aFirstTest && process.exitValue != 0) {
    do_throw("First test, check for service stopped state returned error " +
             process.exitValue);
  }

#ifdef DISABLE_UPDATER_AUTHENTICODE_CHECK
  // We won't be performing signature checks.
  return true;
#else
  // Make sure the binaries are signed
  args = ["check-signature", updaterBinPath];
  process = AUS_Cc["@mozilla.org/process/util;1"].
            createInstance(AUS_Ci.nsIProcess);
  process.init(helperBin);
  process.run(true, args, args.length);
  if (process.exitValue == 0) {
    return true;
  }
  logTestInfo("this test can only run on builds with signed binaries. " +
              FILE_HELPER_BIN + " returned " + process.exitValue)
  return false;
#endif
}

/**
 * Copies the specified filename from the dist/bin
 * directory into the apply-to directory.
 *
 * @param filename The name of the file to copy
*/
function copyBinToApplyToDir(filename) {
  let binDir = getGREDir();
  let fileToCopy = binDir.clone();
  fileToCopy.append(filename);
  if (!fileToCopy.exists()) {
    do_throw("Unable to copy binary: " + filename);
  }
  let applyToUpdater = getApplyDirFile(null, true);
  if (applyToUpdater.path != binDir.path) {
    do_print("copying " + fileToCopy.path + " to: " + applyToUpdater.path);
    fileToCopy.copyTo(applyToUpdater, filename);
  }
}

/**
 * Attempts to upgrade the maintenance service if permissions are allowed.
 * This is useful for XP where we have permission to upgrade in case an
 * older service installer exists.  Also if the user manually installed into
 * a unprivileged location.
*/
function attemptServiceInstall() {
  var version = AUS_Cc["@mozilla.org/system-info;1"]
                .getService(AUS_Ci.nsIPropertyBag2)
                .getProperty("version");
  var isVistaOrHigher = (parseFloat(version) >= 6.0);
  if (isVistaOrHigher) {
    return;
  }

  let binDir = getGREDir();
  let installerFile = binDir.clone();
  installerFile.append(FILE_MAINTENANCE_SERVICE_INSTALLER_BIN);
  if (!installerFile.exists()) {
    do_throw(FILE_MAINTENANCE_SERVICE_INSTALLER_BIN + " not found.");
  }
  let installerProcess = AUS_Cc["@mozilla.org/process/util;1"].
                         createInstance(AUS_Ci.nsIProcess);
  installerProcess.init(installerFile);
  logTestInfo("Starting installer process...");
  installerProcess.run(true, [], 0);
}

/**
 * Helper function for updater tests for launching the updater using the
 * maintenance service to apply a mar file.
 *
 * @param aInitialStatus  the initial value of update.status
 * @param aExpectedStatus the expected value of update.status when the test finishes
 * @param aCallback       the function to be called when the update is finished
 * @param aUpdatesDir     the updates root directory to use (optional)
 * @param aCheckSvcLog    whether the service log should be checked (optional)
 */
function runUpdateUsingService(aInitialStatus, aExpectedStatus,
                               aCallback, aUpdatesDir, aCheckSvcLog) {
  // Check the service logs for a successful update
  function checkServiceLogs(aOriginalContents) {
    let contents = readServiceLogFile();
    logTestInfo("The contents of maintenanceservice.log:\n" + contents + "\n");
    do_check_neq(contents, aOriginalContents);
    do_check_neq(contents.indexOf(LOG_SVC_SUCCESSFUL_LAUNCH), -1);
  }
  function readServiceLogFile() {
    let file = AUS_Cc["@mozilla.org/file/directory_service;1"].
               getService(AUS_Ci.nsIProperties).
               get("CmAppData", AUS_Ci.nsIFile);
    file.append("Mozilla");
    file.append("logs");
    file.append("maintenanceservice.log");
    return readFile(file);
  }
  function waitServiceApps() {
    // maintenanceservice_installer.exe is started async during updates.
    waitForApplicationStop("maintenanceservice_installer.exe");
    // maintenanceservice_tmp.exe is started async from the service installer.
    waitForApplicationStop("maintenanceservice_tmp.exe");
    // In case the SCM thinks the service is stopped, but process still exists.
    waitForApplicationStop("maintenanceservice.exe");
  }
  function waitForServiceStop(aFailTest) {
    waitServiceApps();
    logTestInfo("Waiting for service to stop if necessary...");
    // Use the helper bin to ensure the service is stopped. If not
    // stopped then wait for the service to be stopped (at most 120 seconds)
    let helperBin = getTestDirFile(FILE_HELPER_BIN);
    let helperBinArgs = ["wait-for-service-stop",
                         "MozillaMaintenance",
                         "120"];
    let helperBinProcess = AUS_Cc["@mozilla.org/process/util;1"].
                           createInstance(AUS_Ci.nsIProcess);
    helperBinProcess.init(helperBin);
    logTestInfo("Stopping service...");
    helperBinProcess.run(true, helperBinArgs, helperBinArgs.length);
    if (helperBinProcess.exitValue == 0xEE) {
      do_throw("The service does not exist on this machine.  Return value: " +
               helperBinProcess.exitValue);
    } else if (helperBinProcess.exitValue != 0) {
      if (aFailTest) {
        do_throw("maintenance service did not stop, last state: " +
                 helperBinProcess.exitValue + ". Forcing test failure.");
      } else {
        logTestInfo("maintenance service did not stop, last state: " +
                    helperBinProcess.exitValue + ".  May cause failures.");
      }
    } else {
      logTestInfo("Service stopped.");
    }
    waitServiceApps();
  }
  function waitForApplicationStop(application) {
    logTestInfo("Waiting for " + application + " to stop if " +
                "necessary...");
    // Use the helper bin to ensure the application is stopped.
    // If not, then wait for it to be stopped (at most 120 seconds)
    let helperBin = getTestDirFile(FILE_HELPER_BIN);
    let helperBinArgs = ["wait-for-application-exit",
                         application,
                         "120"];
    let helperBinProcess = AUS_Cc["@mozilla.org/process/util;1"].
                           createInstance(AUS_Ci.nsIProcess);
    helperBinProcess.init(helperBin);
    helperBinProcess.run(true, helperBinArgs, helperBinArgs.length);
    if (helperBinProcess.exitValue != 0) {
      do_throw(application + " did not stop, last state: " +
               helperBinProcess.exitValue + ". Forcing test failure.");
    }
  }

  // Make sure the service from the previous test is already stopped.
  waitForServiceStop(true);

  // Prevent the cleanup function from begin run more than once
  if (typeof(gRegisteredServiceCleanup) === "undefined") {
    gRegisteredServiceCleanup = true;

    do_register_cleanup(function serviceCleanup() {
      resetEnvironment();

      // This will delete the app console log file if it exists.
      try {
        getAppConsoleLogPath();
      }
      catch (e) {
        logTestInfo("unable to remove file during cleanup. Exception: " + e);
      }

      // This will delete the app arguments log file if it exists.
      try {
        getAppArgsLogPath();
      }
      catch (e) {
        logTestInfo("unable to remove file during cleanup. Exception: " + e);
      }
    });
  }

  if (aCheckSvcLog === undefined) {
    aCheckSvcLog = true; // default to true
  }

  let svcOriginalLog;
  if (aCheckSvcLog) {
    svcOriginalLog = readServiceLogFile();
  }

  let appArgsLogPath = getAppArgsLogPath();
  gServiceLaunchedCallbackLog = appArgsLogPath.replace(/^"|"$/g, "");

  let updatesDir = aUpdatesDir || do_get_file(gTestID + UPDATES_DIR_SUFFIX);
  let file = updatesDir.clone();
  file.append(FILE_UPDATE_STATUS);
  writeFile(file, aInitialStatus + "\n");

  // sanity check
  do_check_eq(readStatusFile(updatesDir), aInitialStatus);

  file = updatesDir.clone();
  file.append(FILE_UPDATE_VERSION);
  writeFile(file, DEFAULT_UPDATE_VERSION + "\n");

  gServiceLaunchedCallbackArgs = [
    "-no-remote",
    "-process-updates",
    "-dump-args",
    appArgsLogPath
  ];

  let launchBin = getLaunchBin();
  let args = getProcessArgs(["-dump-args", appArgsLogPath]);
  logTestInfo("launching " + launchBin.path + " " + args.join(" "));

  let process = AUS_Cc["@mozilla.org/process/util;1"].
                   createInstance(AUS_Ci.nsIProcess);
  process.init(launchBin);

  // Override the update root directory
  gEnvUpdateRootOverride = updatesDir.path;
  gEnvAppDirOverride = getApplyDirFile(null).path;
  gEnvSKipUpdateDirHashing = true;

  if (gSwitchApp) {
    // We want to set the env vars again
    gShouldResetEnv = undefined;
  }

  setEnvironment();

  // There is a security check done by the service to make sure the updater
  // we are executing is the same as the one in the apply-to dir.
  // To make sure they match from tests we copy updater.exe to the apply-to dir.
  copyBinToApplyToDir(FILE_UPDATER_BIN);

  // The service will execute maintenanceservice_installer.exe and
  // will copy maintenanceservice.exe out of the same directory from
  // the installation directory.  So we need to make sure both of those
  // bins always exist in the installation directory.
  copyBinToApplyToDir(FILE_MAINTENANCE_SERVICE_BIN);
  copyBinToApplyToDir(FILE_MAINTENANCE_SERVICE_INSTALLER_BIN);

  // Backup the updater-settings.ini file if it exists by moving it.
  let updateSettingsIni = getApplyDirFile(null, true);
  updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
  if (updateSettingsIni.exists()) {
    updateSettingsIni.moveTo(updateSettingsIni.parent, FILE_UPDATE_SETTINGS_INI_BAK);
  }
  updateSettingsIni = getApplyDirFile(null, true);
  updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
  writeFile(updateSettingsIni, UPDATE_SETTINGS_CONTENTS);

  // Firefox does not wait for the service command to finish, but
  // we still launch the process sync to avoid intermittent failures with
  // the log file not being written out yet.
  // We will rely on watching the update.status file and waiting for the service
  // to stop to know the service command is done.
  process.run(true, args, args.length);

  resetEnvironment();

  function timerCallback(timer) {
    // Wait for the expected status
    let status = readStatusFile(updatesDir);
    // For failed status, we don't care what the failure code is
    if (aExpectedStatus == STATE_FAILED) {
      status = status.split(": ")[0];
    }
    // status will probably always be equal to STATE_APPLYING but there is a
    // race condition where it would be possible on slower machines where status
    // could be equal to STATE_PENDING_SVC.
    if (status == STATE_APPLYING ||
        status == STATE_PENDING_SVC) {
      logTestInfo("Still waiting to see the " + aExpectedStatus +
                  " status, got " + status + " for now...");
      return;
    }

    // Make sure all of the logs are written out.
    waitForServiceStop(false);

    // Restore the backed up updater-settings.ini if it exists.
    let updateSettingsIni = getApplyDirFile(null, true);
    updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI_BAK);
    if (updateSettingsIni.exists()) {
      updateSettingsIni.moveTo(updateSettingsIni.parent, FILE_UPDATE_SETTINGS_INI);
    }

    do_check_eq(status, aExpectedStatus);

    timer.cancel();
    timer = null;

    if (aCheckSvcLog) {
      checkServiceLogs(svcOriginalLog);
    }
    aCallback();
  }

  let timer = AUS_Cc["@mozilla.org/timer;1"].createInstance(AUS_Ci.nsITimer);
  timer.initWithCallback(timerCallback, 1000, timer.TYPE_REPEATING_SLACK);
}

/**
 * Gets the platform specific shell binary that is launched using nsIProcess and
 * in turn launches the updater.
 *
 * @return  nsIFile for the shell binary to launch using nsIProcess.
 * @throws  if the shell binary doesn't exist.
 */
function getLaunchBin() {
  let launchBin;
  if (IS_WIN) {
    launchBin = Services.dirsvc.get("WinD", AUS_Ci.nsIFile);
    launchBin.append("System32");
    launchBin.append("cmd.exe");
  }
  else {
    launchBin = AUS_Cc["@mozilla.org/file/local;1"].
                createInstance(AUS_Ci.nsILocalFile);
    launchBin.initWithPath("/bin/sh");
  }

  if (!launchBin.exists())
    do_throw(launchBin.path + " must exist to run this test!");

  return launchBin;
}

function waitForHelperSleep() {
  // Give the lock file process time to lock the file before updating otherwise
  // this test can fail intermittently on Windows debug builds.
  let output = getApplyDirFile("a/b/output", true);
  if (readFile(output) != "sleeping\n") {
    do_timeout(TEST_HELPER_TIMEOUT, waitForHelperSleep);
    return;
  }
  output.remove(false);
  doUpdate();
}

function waitForHelperFinished() {
  // Give the lock file process time to lock the file before updating otherwise
  // this test can fail intermittently on Windows debug builds.
  let output = getApplyDirFile("a/b/output", true);
  if (readFile(output) != "finished\n") {
    do_timeout(TEST_HELPER_TIMEOUT, waitForHelperFinished);
    return;
  }
  // Give the lock file process time to unlock the file before deleting the
  // input and output files.
  waitForHelperFinishFileUnlock();
}

function waitForHelperFinishFileUnlock() {
  try {
    let output = getApplyDirFile("a/b/output", true);
    if (output.exists()) {
      output.remove(false);
    }
    let input = getApplyDirFile("a/b/input", true);
    if (input.exists()) {
      input.remove(false);
    }
  }
  catch (e) {
    // Give the lock file process time to unlock the file before deleting the
    // input and output files.
    do_timeout(TEST_HELPER_TIMEOUT, waitForHelperFinishFileUnlock);
    return;
  }
  checkUpdate();
}

function setupHelperFinish() {
  let input = getApplyDirFile("a/b/input", true);
  writeFile(input, "finish\n");
  waitForHelperFinished();
}

/**
 * Helper function for updater binary tests for setting up the files and
 * directories used by the test.
 *
 * @param   aMarFile
 *          The mar file for the update test.
 */
function setupUpdaterTest(aMarFile) {
  // Remove the directory where the updater, mar file, etc. will be copied to
  let updatesDir = do_get_file(gTestID + UPDATES_DIR_SUFFIX, true);
  try {
    removeDirRecursive(updatesDir);
  }
  catch (e) {
    dump("Unable to remove directory\n" +
         "path: " + updatesDir.path + "\n" +
         "Exception: " + e + "\n");
  }
  if (!updatesDir.exists()) {
    updatesDir.create(AUS_Ci.nsIFile.DIRECTORY_TYPE, PERMS_DIRECTORY);
  }

  // Remove the directory where the update will be applied if it exists.
  let applyToDir = getApplyDirFile(null, true);
  try {
    removeDirRecursive(applyToDir);
  }
  catch (e) {
    dump("Unable to remove directory\n" +
         "path: " + applyToDir.path + "\n" +
         "Exception: " + e + "\n");
  }
  logTestInfo("testing successful removal of the directory used to apply the " +
              "mar file");
  do_check_false(applyToDir.exists());

  // Add the test files that will be updated for a successful update or left in
  // the initial state for a failed update.
  TEST_FILES.forEach(function SUT_TF_FE(aTestFile) {
    if (aTestFile.originalFile || aTestFile.originalContents) {
      let testDir = getApplyDirFile(aTestFile.relPathDir, true);
      if (!testDir.exists())
        testDir.create(AUS_Ci.nsIFile.DIRECTORY_TYPE, PERMS_DIRECTORY);

      let testFile;
      if (aTestFile.originalFile) {
        testFile = getTestDirFile(aTestFile.originalFile);
        testFile.copyTo(testDir, aTestFile.fileName);
        testFile = getApplyDirFile(aTestFile.relPathDir + aTestFile.fileName);
      }
      else {
        testFile = getApplyDirFile(aTestFile.relPathDir + aTestFile.fileName, true);
        writeFile(testFile, aTestFile.originalContents);
      }

      // Skip these tests on Windows and OS/2 since their
      // implementaions of chmod doesn't really set permissions.
      if (!IS_WIN && !IS_OS2 && aTestFile.originalPerms) {
        testFile.permissions = aTestFile.originalPerms;
        // Store the actual permissions on the file for reference later after
        // setting the permissions.
        if (!aTestFile.comparePerms)
          aTestFile.comparePerms = testFile.permissions;
      }
    }
  });

  let helperBin = getTestDirFile(FILE_HELPER_BIN);
  let afterApplyBinDir = getApplyDirFile("a/b/", true);
  helperBin.copyTo(afterApplyBinDir, gCallbackBinFile);

  // Copy the mar that will be applied
  let mar = getTestDirFile(aMarFile);
  mar.copyTo(updatesDir, FILE_UPDATE_ARCHIVE);

  // Add the test directory that will be updated for a successful update or left in
  // the initial state for a failed update.
  var testDirs = TEST_DIRS.concat(ADDITIONAL_TEST_DIRS);
  testDirs.forEach(function SUT_TD_FE(aTestDir) {
    let testDir = getApplyDirFile(aTestDir.relPathDir, true);
    if (!testDir.exists()) {
      testDir.create(AUS_Ci.nsIFile.DIRECTORY_TYPE, PERMS_DIRECTORY);
    }

    if (aTestDir.files) {
      aTestDir.files.forEach(function SUT_TD_F_FE(aTestFile) {
        let testFile = getApplyDirFile(aTestDir.relPathDir + aTestFile, true);
        if (!testFile.exists()) {
          testFile.create(AUS_Ci.nsIFile.NORMAL_FILE_TYPE, PERMS_FILE);
        }
      });
    }

    if (aTestDir.subDirs) {
      aTestDir.subDirs.forEach(function SUT_TD_SD_FE(aSubDir) {
        let testSubDir = getApplyDirFile(aTestDir.relPathDir + aSubDir, true);
        if (!testSubDir.exists()) {
          testSubDir.create(AUS_Ci.nsIFile.DIRECTORY_TYPE, PERMS_DIRECTORY);
        }

        if (aTestDir.subDirFiles) {
          aTestDir.subDirFiles.forEach(function SUT_TD_SDF_FE(aTestFile) {
            let testFile = getApplyDirFile(aTestDir.relPathDir + aSubDir + aTestFile, true);
            if (!testFile.exists()) {
              testFile.create(AUS_Ci.nsIFile.NORMAL_FILE_TYPE, PERMS_FILE);
            }
          });
        }
      });
    }
  });
}

/**
 * Helper function for updater binary tests to clean up the state after the test
 * has finished.
 */
function cleanupUpdaterTest() {
  logTestInfo("start - updater test cleanup");
  let updatesDir = do_get_file(gTestID + UPDATES_DIR_SUFFIX, true);
  try {
    removeDirRecursive(updatesDir);
  }
  catch (e) {
    dump("Unable to remove directory\n" +
         "path: " + updatesDir.path + "\n" +
         "Exception: " + e + "\n");
  }

  // Try to remove the updates and the apply to directories.
  let applyToDir = getApplyDirFile(null, true).parent;
  try {
    removeDirRecursive(applyToDir);
  }
  catch (e) {
    dump("Unable to remove directory\n" +
         "path: " + applyToDir.path + "\n" +
         "Exception: " + e + "\n");
  }

  cleanupTestCommon();
  logTestInfo("finish - updater test cleanup");
}

/**
 * Helper function for updater binary tests for verifying the contents of the
 * update log after a successful update.
 */
function checkUpdateLogContents(aCompareLogFile) {
  let updateLog = do_get_file(gTestID + UPDATES_DIR_SUFFIX, true);
  updateLog.append(FILE_UPDATE_LOG);
  let updateLogContents = readFileBytes(updateLog);
  if (gBackgroundUpdate) {
    // Skip the background update messages
    updateLogContents = updateLogContents.replace(/Performing a background update/, "");
  } else if (gSwitchApp) {
    // Skip the switch app request messages
    updateLogContents = updateLogContents.replace(/Performing a background update/, "");
    updateLogContents = updateLogContents.replace(/Performing a replace request/, "");
  }
  // Skip the source/destination lines since they contain absolute paths.
  updateLogContents = updateLogContents.replace(/SOURCE DIRECTORY.*/g, "");
  updateLogContents = updateLogContents.replace(/DESTINATION DIRECTORY.*/g, "");
  // Skip lines that log failed attempts to open the callback executable.
  updateLogContents = updateLogContents.replace(/NS_main: callback app open attempt .*/g, "");
  if (gSwitchApp) {
    // Remove the lines which contain absolute paths
    updateLogContents = updateLogContents.replace(/^Begin moving.*$/mg, "");
#ifdef XP_MACOSX
    // Remove the entire section about moving the precomplete file as it contains
    // absolute paths.
    updateLogContents = updateLogContents.replace(/\n/g, "%%%EOL%%%");
    updateLogContents = updateLogContents.replace(/Moving the precomplete file.*Finished moving the precomplete file/, "");
    updateLogContents = updateLogContents.replace(/%%%EOL%%%/g, "\n");
#endif
  }
  updateLogContents = updateLogContents.replace(/\r/g, "");
  // Replace error codes since they are different on each platform.
  updateLogContents = updateLogContents.replace(/, err:.*\n/g, "\n");
  // Replace to make the log parsing happy.
  updateLogContents = updateLogContents.replace(/non-fatal error /g, "");
  // The FindFile results when enumerating the filesystem on Windows is not
  // determistic so the results matching the following need to be ignored.
  updateLogContents = updateLogContents.replace(/.* a\/b\/7\/7text.*\n/g, "");
  // Remove consecutive newlines
  updateLogContents = updateLogContents.replace(/\n+/g, "\n");
  // Remove leading and trailing newlines
  updateLogContents = updateLogContents.replace(/^\n|\n$/g, "");

  let compareLog = getTestDirFile(aCompareLogFile);
  let compareLogContents = readFileBytes(compareLog);
  // Remove leading and trailing newlines
  compareLogContents = compareLogContents.replace(/^\n|\n$/g, "");

  // Don't write the contents of the file to the log to reduce log spam
  // unless there is a failure.
  if (compareLogContents == updateLogContents) {
    logTestInfo("log contents are correct");
    do_check_true(true);
  }
  else {
    logTestInfo("log contents are not correct");
    do_check_eq(compareLogContents, updateLogContents);
  }
}

function checkUpdateLogContains(aCheckString) {
  let updateLog = do_get_file(gTestID + UPDATES_DIR_SUFFIX, true);
  updateLog.append(FILE_UPDATE_LOG);
  let updateLogContents = readFileBytes(updateLog);
  if (updateLogContents.indexOf(aCheckString) != -1) {
    logTestInfo("log file does contain: " + aCheckString);
    do_check_true(true);
  }
  else {
    logTestInfo("log file does not contain: " + aCheckString);
    logTestInfo("log file contents:\n" + updateLogContents);
    do_check_true(false);
  }
}

/**
 * Helper function for updater binary tests for verifying the state of files and
 * directories after a successful update.
 */
function checkFilesAfterUpdateSuccess() {
  logTestInfo("testing contents of files after a successful update");
  TEST_FILES.forEach(function CFAUS_TF_FE(aTestFile) {
    let testFile = getTargetDirFile(aTestFile.relPathDir + aTestFile.fileName, true);
    logTestInfo("testing file: " + testFile.path);
    if (aTestFile.compareFile || aTestFile.compareContents) {
      do_check_true(testFile.exists());

      // Skip these tests on Windows and OS/2 since their
      // implementaions of chmod doesn't really set permissions.
      if (!IS_WIN && !IS_OS2 && aTestFile.comparePerms) {
        // Check if the permssions as set in the complete mar file are correct.
        let logPerms = "testing file permissions - ";
        if (aTestFile.originalPerms) {
          logPerms += "original permissions: " + aTestFile.originalPerms.toString(8) + ", ";
        }
        logPerms += "compare permissions : " + aTestFile.comparePerms.toString(8) + ", ";
        logPerms += "updated permissions : " + testFile.permissions.toString(8);
        logTestInfo(logPerms);
        do_check_eq(testFile.permissions & 0xfff, aTestFile.comparePerms & 0xfff);
      }

      let fileContents1 = readFileBytes(testFile);
      let fileContents2 = aTestFile.compareFile ?
                          readFileBytes(getTestDirFile(aTestFile.compareFile)) :
                          aTestFile.compareContents;
      // Don't write the contents of the file to the log to reduce log spam
      // unless there is a failure.
      if (fileContents1 == fileContents2) {
        logTestInfo("file contents are correct");
        do_check_true(true);
      }
      else {
        logTestInfo("file contents are not correct");
        do_check_eq(fileContents1, fileContents2);
      }
    }
    else {
      do_check_false(testFile.exists());
    }
  });

  logTestInfo("testing operations specified in removed-files were performed " +
              "after a successful update");
  var testDirs = TEST_DIRS.concat(ADDITIONAL_TEST_DIRS);
  testDirs.forEach(function CFAUS_TD_FE(aTestDir) {
    let testDir = getTargetDirFile(aTestDir.relPathDir, true);
    logTestInfo("testing directory: " + testDir.path);
    if (aTestDir.dirRemoved) {
      do_check_false(testDir.exists());
    }
    else {
      do_check_true(testDir.exists());

      if (aTestDir.files) {
        aTestDir.files.forEach(function CFAUS_TD_F_FE(aTestFile) {
          let testFile = getTargetDirFile(aTestDir.relPathDir + aTestFile, true);
          logTestInfo("testing directory file: " + testFile.path);
          if (aTestDir.filesRemoved) {
            do_check_false(testFile.exists());
          }
          else {
            do_check_true(testFile.exists());
          }
        });
      }

      if (aTestDir.subDirs) {
        aTestDir.subDirs.forEach(function CFAUS_TD_SD_FE(aSubDir) {
          let testSubDir = getTargetDirFile(aTestDir.relPathDir + aSubDir, true);
          logTestInfo("testing sub-directory: " + testSubDir.path);
          do_check_true(testSubDir.exists());
          if (aTestDir.subDirFiles) {
            aTestDir.subDirFiles.forEach(function CFAUS_TD_SDF_FE(aTestFile) {
              let testFile = getTargetDirFile(aTestDir.relPathDir + aSubDir + aTestFile, true);
              logTestInfo("testing sub-directory file: " + testFile.path);
              do_check_true(testFile.exists());
            });
          }
        });
      }
    }
  });

  checkFilesAfterUpdateCommon();
}

/**
 * Helper function for updater binary tests for verifying the state of files and
 * directories after a failed update.
 *
 * @param aGetDirectory: the function used to get the files in the target directory.
 * Pass getApplyDirFile if you want to test the case of a failed switch request.
 */
function checkFilesAfterUpdateFailure(aGetDirectory) {
  let getdir = aGetDirectory || getTargetDirFile;
  logTestInfo("testing contents of files after a failed update");
  TEST_FILES.forEach(function CFAUF_TF_FE(aTestFile) {
    let testFile = getdir(aTestFile.relPathDir + aTestFile.fileName, true);
    logTestInfo("testing file: " + testFile.path);
    if (aTestFile.compareFile || aTestFile.compareContents) {
      do_check_true(testFile.exists());

      // Skip these tests on Windows and OS/2 since their
      // implementaions of chmod doesn't really set permissions.
      if (!IS_WIN && !IS_OS2 && aTestFile.comparePerms) {
        // Check the original permssions are retained on the file.
        let logPerms = "testing file permissions - ";
        if (aTestFile.originalPerms) {
          logPerms += "original permissions: " + aTestFile.originalPerms.toString(8) + ", ";
        }
        logPerms += "compare permissions : " + aTestFile.comparePerms.toString(8) + ", ";
        logPerms += "updated permissions : " + testFile.permissions.toString(8);
        logTestInfo(logPerms);
        do_check_eq(testFile.permissions & 0xfff, aTestFile.comparePerms & 0xfff);
      }

      let fileContents1 = readFileBytes(testFile);
      let fileContents2 = aTestFile.compareFile ?
                          readFileBytes(getTestDirFile(aTestFile.compareFile)) :
                          aTestFile.compareContents;
      // Don't write the contents of the file to the log to reduce log spam
      // unless there is a failure.
      if (fileContents1 == fileContents2) {
        logTestInfo("file contents are correct");
        do_check_true(true);
      }
      else {
        logTestInfo("file contents are not correct");
        do_check_eq(fileContents1, fileContents2);
      }
    }
    else {
      do_check_false(testFile.exists());
    }
  });

  logTestInfo("testing operations specified in removed-files were not " +
              "performed after a failed update");
  TEST_DIRS.forEach(function CFAUF_TD_FE(aTestDir) {
    let testDir = getdir(aTestDir.relPathDir, true);
    logTestInfo("testing directory file: " + testDir.path);
    do_check_true(testDir.exists());

    if (aTestDir.files) {
      aTestDir.files.forEach(function CFAUS_TD_F_FE(aTestFile) {
        let testFile = getdir(aTestDir.relPathDir + aTestFile, true);
        logTestInfo("testing directory file: " + testFile.path);
        do_check_true(testFile.exists());
      });
    }

    if (aTestDir.subDirs) {
      aTestDir.subDirs.forEach(function CFAUS_TD_SD_FE(aSubDir) {
        let testSubDir = getdir(aTestDir.relPathDir + aSubDir, true);
        logTestInfo("testing sub-directory: " + testSubDir.path);
        do_check_true(testSubDir.exists());
        if (aTestDir.subDirFiles) {
          aTestDir.subDirFiles.forEach(function CFAUS_TD_SDF_FE(aTestFile) {
            let testFile = getdir(aTestDir.relPathDir + aSubDir + aTestFile, true);
            logTestInfo("testing sub-directory file: " + testFile.path);
            do_check_true(testFile.exists());
          });
        }
      });
    }
  });

  checkFilesAfterUpdateCommon();
}

/**
 * Helper function for updater binary tests for verifying patch files and
 * moz-backup files aren't left behind after a successful or failed update.
 */
function checkFilesAfterUpdateCommon() {
  logTestInfo("testing patch files should not be left behind");
  let updatesDir = do_get_file(gTestID + UPDATES_DIR_SUFFIX, true);
  let entries = updatesDir.QueryInterface(AUS_Ci.nsIFile).directoryEntries;
  while (entries.hasMoreElements()) {
    let entry = entries.getNext().QueryInterface(AUS_Ci.nsIFile);
    do_check_neq(getFileExtension(entry), "patch");
  }

  logTestInfo("testing backup files should not be left behind");
  let applyToDir = getTargetDirFile(null, true);
  checkFilesInDirRecursive(applyToDir, checkForBackupFiles);
}

/**
 * Helper function for updater binary tests for verifying the contents of the
 * updater callback application log which should contain the arguments passed to
 * the callback application.
 */
function checkCallbackAppLog() {
  let appLaunchLog = getApplyDirFile("a/b/" + gCallbackArgs[1], true);
  if (!appLaunchLog.exists()) {
    do_timeout(TEST_HELPER_TIMEOUT, checkCallbackAppLog);
    return;
  }

  let expectedLogContents = gCallbackArgs.join("\n") + "\n";
  let logContents = readFile(appLaunchLog);
  // It is possible for the log file contents check to occur before the log file
  // contents are completely written so wait until the contents are the expected
  // value. If the contents are never the expected value then the test will
  // fail by timing out.
  if (logContents != expectedLogContents) {
    do_timeout(TEST_HELPER_TIMEOUT, checkCallbackAppLog);
    return;
  }

  if (logContents == expectedLogContents) {
    logTestInfo("callback log file contents are correct");
    do_check_true(true);
  }
  else {
    logTestInfo("callback log file contents are not correct");
    do_check_eq(logContents, expectedLogContents);
  }

  removeCallbackCopy();
}

/**
 * Helper function for updater service tests for verifying the contents of the
 * updater callback application log which should contain the arguments passed to
 * the callback application.
 */
function checkCallbackServiceLog() {
  do_check_neq(gServiceLaunchedCallbackLog, null);

  let expectedLogContents = gServiceLaunchedCallbackArgs.join("\n") + "\n";
  let logFile = AUS_Cc["@mozilla.org/file/local;1"].createInstance(AUS_Ci.nsILocalFile);
  logFile.initWithPath(gServiceLaunchedCallbackLog);
  let logContents = readFile(logFile);

  // It is possible for the log file contents check to occur before the log file
  // contents are completely written so wait until the contents are the expected
  // value. If the contents are never the expected value then the test will
  // fail by timing out.
  if (logContents != expectedLogContents) {
    logTestInfo("callback service log not expected value, waiting longer");
    do_timeout(TEST_HELPER_TIMEOUT, checkCallbackServiceLog);
    return;
  }

  logTestInfo("testing that the callback application successfully launched " +
              "and the expected command line arguments passed to it");
  do_check_eq(logContents, expectedLogContents);

  removeCallbackCopy();
}

function removeCallbackCopy() {
  // Remove the copy of the application executable used for the test on
  // Windows if it exists.
  let appBinCopy = getAppDir();
  appBinCopy.append(gTestID + FILE_WIN_TEST_EXE);
  if (appBinCopy.exists()) {
    try {
      logTestInfo("attempting removal of file: " + appBinCopy.path);
      appBinCopy.remove(false);
    }
    catch (e) {
      logTestInfo("non-fatal error removing file after test finished (will " +
                  "try again). File: " + appBinCopy.path + " Exception: " + e);
      do_timeout(TEST_HELPER_TIMEOUT, removeCallbackCopy);
      return;
    }
  }
  logTestInfo("attempting removal of the updater binary");
  removeUpdater();
}


/**
 * Helper function for updater tests that removes the updater binary before
 * ending the test so the updater binary isn't in use during test cleanup.
 */
function removeUpdater() {
  if (IS_WIN) {
    // Remove the copy of the application executable used for the test on
    // Windows if it exists.
    let updater = getUpdatesDir();
    updater.append("0");
    updater.append(FILE_UPDATER_BIN);
    if (updater.exists()) {
      try {
        updater.remove(false);
      }
      catch (e) {
        logTestInfo("non-fatal error removing file after test finished (will " +
                    "try again). File: " + updater.path + " Exception: " + e);
        do_timeout(TEST_HELPER_TIMEOUT, removeUpdater);
        return;
      }
    }
    else {
      logTestInfo("updater doesn't exist, path: " + updater.path);
    }
  }
  logTestInfo("calling do_test_finished");
  do_test_finished();
}

// Waits until files that are in use that break tests are no longer in use and
// then calls removeCallbackCopy.
function waitForFilesInUse() {
  let maintSvcInstaller = getAppDir();
  maintSvcInstaller.append("FILE_MAINTENANCE_SERVICE_INSTALLER_BIN");

  let helper = getAppDir();
  helper.append("uninstall");
  helper.append("helper.exe");

  let files = [maintSvcInstaller, helper];
  for (let i = 0; i < files.length; ++i) {
    let file = files[i];
    let fileBak = file.parent.clone();
    if (file.exists()) {
      fileBak.append(file.leafName + ".bak");
      try {
        if (fileBak.exists()) {
          fileBak.remove(false);
        }
        file.copyTo(fileBak.parent, fileBak.leafName);
        file.remove(false);
        fileBak.moveTo(file.parent, file.leafName);
        logTestInfo("file is not in use. path: " + file.path);
      }
      catch (e) {
        logTestInfo("file in use, will try again after " + TEST_CHECK_TIMEOUT +
                    " ms, path: " + file.path + ", exception: " + e);
        try {
          if (fileBak.exists()) {
            fileBak.remove(false);
          }
        }
        catch (e) {
          logTestInfo("unable to remove file, this should never happen! " +
                      "path: " + fileBak.path + ", exception: " + e);
        }
        do_timeout(TEST_CHECK_TIMEOUT, waitForFilesInUse);
        return;
      }
    }
  }

  removeCallbackCopy();
}

/**
 * Helper function for updater binary tests for verifying there are no update
 * backup files left behind after an update.
 *
 * @param   aFile
 *          An nsIFile to check if it has moz-backup for its extension.
 */
function checkForBackupFiles(aFile) {
  do_check_neq(getFileExtension(aFile), "moz-backup");
}

/**
 * Helper function for updater binary tests for recursively enumerating a
 * directory and calling a callback function with the file as a parameter for
 * each file found.
 *
 * @param   aDir
 *          A nsIFile for the directory to be deleted
 * @param   aCallback
 *          A callback function that will be called with the file as a
 *          parameter for each file found.
 */
function checkFilesInDirRecursive(aDir, aCallback) {
  if (!aDir.exists())
    do_throw("Directory must exist!");

  let dirEntries = aDir.directoryEntries;
  while (dirEntries.hasMoreElements()) {
    let entry = dirEntries.getNext().QueryInterface(AUS_Ci.nsIFile);

    if (entry.isDirectory()) {
      checkFilesInDirRecursive(entry, aCallback);
    }
    else {
      aCallback(entry);
    }
  }
}

/**
 * Sets up the bare bones XMLHttpRequest implementation below.
 *
 * @param   callback
 *          The callback function that will call the nsIDomEventListener's
 *          handleEvent method.
 *
 *          Example of the callback function
 *
 *            function callHandleEvent() {
 *              gXHR.status = gExpectedStatus;
 *              var e = { target: gXHR };
 *              gXHR.onload.handleEvent(e);
 *            }
 */
function overrideXHR(callback) {
  gXHRCallback = callback;
  gXHR = new xhr();
  var registrar = Components.manager.QueryInterface(AUS_Ci.nsIComponentRegistrar);
  registrar.registerFactory(gXHR.classID, gXHR.classDescription,
                            gXHR.contractID, gXHR);
}


/**
 * Bare bones XMLHttpRequest implementation for testing onprogress, onerror,
 * and onload nsIDomEventListener handleEvent.
 */
function makeHandler(val) {
  if (typeof val == "function")
    return ({ handleEvent: val });
  return val;
}
function xhr() {
}
xhr.prototype = {
  overrideMimeType: function(mimetype) { },
  setRequestHeader: function(header, value) { },
  status: null,
  channel: { set notificationCallbacks(val) { } },
  _url: null,
  _method: null,
  open: function (method, url) {
    gXHR.channel.originalURI = Services.io.newURI(url, null, null);
    gXHR._method = method; gXHR._url = url;
  },
  responseXML: null,
  responseText: null,
  send: function(body) {
    do_execute_soon(gXHRCallback); // Use a timeout so the XHR completes
  },
  _onprogress: null,
  set onprogress(val) { gXHR._onprogress = makeHandler(val); },
  get onprogress() { return gXHR._onprogress; },
  _onerror: null,
  set onerror(val) { gXHR._onerror = makeHandler(val); },
  get onerror() { return gXHR._onerror; },
  _onload: null,
  set onload(val) { gXHR._onload = makeHandler(val); },
  get onload() { return gXHR._onload; },
  addEventListener: function(event, val, capturing) {
    eval("gXHR._on" + event + " = val");
  },
  flags: AUS_Ci.nsIClassInfo.SINGLETON,
  implementationLanguage: AUS_Ci.nsIProgrammingLanguage.JAVASCRIPT,
  getHelperForLanguage: function(language) null,
  getInterfaces: function(count) {
    var interfaces = [AUS_Ci.nsISupports];
    count.value = interfaces.length;
    return interfaces;
  },
  classDescription: "XMLHttpRequest",
  contractID: "@mozilla.org/xmlextras/xmlhttprequest;1",
  classID: Components.ID("{c9b37f43-4278-4304-a5e0-600991ab08cb}"),
  createInstance: function (outer, aIID) {
    if (outer == null)
      return gXHR.QueryInterface(aIID);
    throw AUS_Cr.NS_ERROR_NO_AGGREGATION;
  },
  QueryInterface: function(aIID) {
    if (aIID.equals(AUS_Ci.nsIClassInfo) ||
        aIID.equals(AUS_Ci.nsISupports))
      return gXHR;
    throw AUS_Cr.NS_ERROR_NO_INTERFACE;
  },
  get wrappedJSObject() { return this; }
};

function overrideUpdatePrompt(callback) {
  var registrar = Components.manager.QueryInterface(AUS_Ci.nsIComponentRegistrar);
  gUpdatePrompt = new UpdatePrompt();
  gUpdatePromptCallback = callback;
  registrar.registerFactory(gUpdatePrompt.classID, gUpdatePrompt.classDescription,
                            gUpdatePrompt.contractID, gUpdatePrompt);
}

function UpdatePrompt() {
  var fns = ["checkForUpdates", "showUpdateAvailable", "showUpdateDownloaded",
             "showUpdateError", "showUpdateHistory", "showUpdateInstalled"];

  fns.forEach(function(promptFn) {
    UpdatePrompt.prototype[promptFn] = function() {
      if (!gUpdatePromptCallback) {
        return;
      }

      var callback = gUpdatePromptCallback[promptFn];
      if (!callback) {
        return;
      }

      callback.apply(gUpdatePromptCallback,
                     Array.prototype.slice.call(arguments));
    }
  });
}

UpdatePrompt.prototype = {
  flags: AUS_Ci.nsIClassInfo.SINGLETON,
  implementationLanguage: AUS_Ci.nsIProgrammingLanguage.JAVASCRIPT,
  getHelperForLanguage: function(language) null,
  getInterfaces: function(count) {
    var interfaces = [AUS_Ci.nsISupports, AUS_Ci.nsIUpdatePrompt];
    count.value = interfaces.length;
    return interfaces;
  },
  classDescription: "UpdatePrompt",
  contractID: "@mozilla.org/updates/update-prompt;1",
  classID: Components.ID("{8c350a15-9b90-4622-93a1-4d320308664b}"),
  createInstance: function (outer, aIID) {
    if (outer == null)
      return gUpdatePrompt.QueryInterface(aIID);
    throw AUS_Cr.NS_ERROR_NO_AGGREGATION;
  },
  QueryInterface: function(aIID) {
    if (aIID.equals(AUS_Ci.nsIClassInfo) ||
        aIID.equals(AUS_Ci.nsISupports) ||
        aIID.equals(AUS_Ci.nsIUpdatePrompt))
      return gUpdatePrompt;
    throw AUS_Cr.NS_ERROR_NO_INTERFACE;
  },
};



/* Update check listener */
const updateCheckListener = {
  onProgress: function UCL_onProgress(request, position, totalSize) {
  },

  onCheckComplete: function UCL_onCheckComplete(request, updates, updateCount) {
    gRequestURL = request.channel.originalURI.spec;
    gUpdateCount = updateCount;
    gUpdates = updates;
    logTestInfo("url = " + gRequestURL + ", " +
                "request.status = " + request.status + ", " +
                "update.statusText = " + request.statusText + ", " +
                "updateCount = " + updateCount);
    // Use a timeout to allow the XHR to complete
    do_execute_soon(gCheckFunc);
  },

  onError: function UCL_onError(request, update) {
    gRequestURL = request.channel.originalURI.spec;
    gStatusCode = request.status;

    gStatusText = update.statusText;
    logTestInfo("url = " + gRequestURL + ", " +
                "request.status = " + gStatusCode + ", " +
                "update.statusText = " + gStatusText);
    // Use a timeout to allow the XHR to complete
    do_execute_soon(gCheckFunc.bind(null, request, update));
  },

  QueryInterface: function(aIID) {
    if (!aIID.equals(AUS_Ci.nsIUpdateCheckListener) &&
        !aIID.equals(AUS_Ci.nsISupports))
      throw AUS_Cr.NS_ERROR_NO_INTERFACE;
    return this;
  }
};

/**
 * Helper for starting the http server used by the tests
 */
function start_httpserver() {
  let dir = getTestDirFile();
  logTestInfo("http server file path: " + dir.path);

  if (!dir.isDirectory()) {
    do_throw("A file instead of a directory was specified for HttpServer " +
             "registerDirectory! path: " + dir.path + "\n");
  }

  Components.utils.import("resource://testing-common/httpd.js");
  gTestserver = new HttpServer();
  gTestserver.registerDirectory("/", dir);
  gTestserver.start(-1);
  let testserverPort = gTestserver.identity.primaryPort;
  gURLData = URL_HOST + ":" + testserverPort + "/";
  logTestInfo("http server port = " + testserverPort);
}

/* Helper for stopping the http server used by the tests */
function stop_httpserver(callback) {
  do_check_true(!!callback);
  gTestserver.stop(callback);
}

/**
 * Creates an nsIXULAppInfo
 *
 * @param   id
 *          The ID of the test application
 * @param   name
 *          A name for the test application
 * @param   version
 *          The version of the application
 * @param   platformVersion
 *          The gecko version of the application
 */
function createAppInfo(id, name, version, platformVersion) {
  const XULAPPINFO_CONTRACTID = "@mozilla.org/xre/app-info;1";
  const XULAPPINFO_CID = Components.ID("{c763b610-9d49-455a-bbd2-ede71682a1ac}");
  var XULAppInfo = {
    vendor: APP_INFO_VENDOR,
    name: name,
    ID: id,
    version: version,
    appBuildID: "2007010101",
    platformVersion: platformVersion,
    platformBuildID: "2007010101",
    inSafeMode: false,
    logConsoleErrors: true,
    OS: "XPCShell",
    XPCOMABI: "noarch-spidermonkey",

    QueryInterface: function QueryInterface(iid) {
      if (iid.equals(AUS_Ci.nsIXULAppInfo) ||
          iid.equals(AUS_Ci.nsIXULRuntime) ||
#ifdef XP_WIN
          iid.equals(AUS_Ci.nsIWinAppHelper) ||
#endif
          iid.equals(AUS_Ci.nsISupports))
        return this;
      throw AUS_Cr.NS_ERROR_NO_INTERFACE;
    }
  };

  var XULAppInfoFactory = {
    createInstance: function (outer, iid) {
      if (outer == null)
        return XULAppInfo.QueryInterface(iid);
      throw AUS_Cr.NS_ERROR_NO_AGGREGATION;
    }
  };

  var registrar = Components.manager.QueryInterface(AUS_Ci.nsIComponentRegistrar);
  registrar.registerFactory(XULAPPINFO_CID, "XULAppInfo",
                            XULAPPINFO_CONTRACTID, XULAppInfoFactory);
}

/**
 * Returns the platform specific arguments used by nsIProcess when launching
 * the application.
 *
 * @param aExtraArgs optional array of extra arguments
 * @return  an array of arguments to be passed to nsIProcess.
 *
 * Notes:
 * 1. Mozilla universal binaries that contain both i386 and x86_64 on Mac OS X
 *    10.5.x must be launched using the i386 architecture.
 * 2. A shell is necessary to pipe the application's console output which
 *    would otherwise pollute the xpcshell log.
 *
 * Command line arguments used when launching the application:
 * -no-remote prevents shell integration from being affected by an existing
 * application process.
 * -process-updates makes the application exits after being relaunched by the
 * updater.
 * 1> pipes stdout to a file.
 * appConsoleLogPath is the file path to pipe the output from the shell.
 * Otherwise the output from the application will end up in the xpchsell log.
 * 2>&1 pipes stderr to sdout.
 */
function getProcessArgs(aExtraArgs) {
  if (!aExtraArgs) {
    aExtraArgs = [];
  }

  // Pipe the output from the launched application to a file so the output from
  // its console isn't present in the xpcshell log.
  let appConsoleLogPath = getAppConsoleLogPath();

  let args;
  if (IS_UNIX) {
    let launchScript = getLaunchScript();
    // Precreate the script with executable permissions
    launchScript.create(AUS_Ci.nsILocalFile.NORMAL_FILE_TYPE, PERMS_DIRECTORY);

    let scriptContents = "#! /bin/sh\n";
    scriptContents += gAppBinPath + " -no-remote -process-updates " +
                      aExtraArgs.join(" ") + " 1> " +
                      appConsoleLogPath + " 2>&1";
    writeFile(launchScript, scriptContents);
    logTestInfo("created " + launchScript.path + " containing:\n" +
                scriptContents);
    args = [launchScript.path];
  }
  else {
    args = ["/D", "/Q", "/C", gAppBinPath, "-no-remote", "-process-updates"].
           concat(aExtraArgs).
           concat(["1>", appConsoleLogPath, "2>&1"]);
  }
  return args;
}

/**
 * Gets a file path for piping the console output from the application so it
 * doesn't appear in the xpcshell log file.
 *
 * @return  path to the file for piping the console output from the application.
 */
function getAppConsoleLogPath() {
  let appConsoleLog = do_get_file("/", true);
  appConsoleLog.append(gTestID + "_app_console_log");
  if (appConsoleLog.exists()) {
    appConsoleLog.remove(false);
  }
  let appConsoleLogPath = appConsoleLog.path;
  if (/ /.test(appConsoleLogPath)) {
    appConsoleLogPath = '"' + appConsoleLogPath + '"';
  }
  return appConsoleLogPath;
}

/**
 * Gets a file path for the application to dump its arguments into.  This is used
 * to verify that a callback application is launched.
 *
 * @return  the file for the application to dump its arguments into.
 */
function getAppArgsLogPath() {
  let appArgsLog = do_get_file("/", true);
  appArgsLog.append(gTestID + "_app_args_log");
  if (appArgsLog.exists()) {
    appArgsLog.remove(false);
  }
  let appArgsLogPath = appArgsLog.path;
  if (/ /.test(appArgsLogPath)) {
    appArgsLogPath = '"' + appArgsLogPath + '"';
  }
  return appArgsLogPath;
}

/**
 * Gets the nsIFile reference for the shell script to launch the application. If
 * the file exists it will be removed by this function.
 *
 * @return  the nsIFile for the shell script to launch the application.
 */
function getLaunchScript() {
  let launchScript = do_get_file("/", true);
  launchScript.append(gTestID + "_launch.sh");
  if (launchScript.exists()) {
    launchScript.remove(false);
  }
  return launchScript;
}

/**
 * Checks for the existence of a platform specific application binary that can
 * be used for the test and gets its path if it is found.
 *
 * Note: The application shell scripts for launching the application work on all
 * platforms that provide a launch shell script except for Mac OS X 10.5 which
 * is why this test uses the binaries to launch the application.
 */
XPCOMUtils.defineLazyGetter(this, "gAppBinPath", function test_gAppBinPath() {
  let processDir = getAppDir();
  let appBin = processDir.clone();
  appBin.append(APP_BIN_NAME + APP_BIN_SUFFIX);
  if (appBin.exists()) {
    if (IS_WIN) {
      let appBinCopy = processDir.clone();
      appBinCopy.append(gTestID + FILE_WIN_TEST_EXE);
      if (appBinCopy.exists()) {
        appBinCopy.remove(false);
      }
      appBin.copyTo(processDir, gTestID + FILE_WIN_TEST_EXE);
      appBin = processDir.clone();
      appBin.append(gTestID + FILE_WIN_TEST_EXE);
    }
    let appBinPath = appBin.path;
    if (/ /.test(appBinPath)) {
      appBinPath = '"' + appBinPath + '"';
    }
    return appBinPath;
  }
  return null;
});

/**
 * This dummy function just returns false.  Tests which wish to adjust the app
 * directory on Mac OS X should define a real version of this function.
 */
function shouldAdjustPathsOnMac() {
  return false;
}

// Override getUpdatesRootDir on Mac because we need to apply the update
// inside the bundle directory.
function symlinkUpdateFilesIntoBundleDirectory() {
  if (!shouldAdjustPathsOnMac()) {
    return;
  }
  // Symlink active-update.xml and updates/ inside the dist/bin directory
  // to point to the bundle directory.
  // This is necessary because in order to test the code which actually ships
  // with Firefox, we need to perform the update inside the bundle directory,
  // whereas xpcshell runs from dist/bin/, and the updater service code looks
  // at the current process directory to find things like these two files.

  Components.utils.import("resource://gre/modules/ctypes.jsm");
  let libc = ctypes.open("/usr/lib/libc.dylib");
  // We need these two low level APIs because their functionality is not
  // provided in nsIFile APIs.
  let symlink = libc.declare("symlink", ctypes.default_abi, ctypes.int,
                             ctypes.char.ptr, ctypes.char.ptr);
  let unlink = libc.declare("unlink", ctypes.default_abi, ctypes.int,
                            ctypes.char.ptr);

  // Symlink active-update.xml
  let dest = getAppDir();
  dest.append("active-update.xml");
  if (!dest.exists()) {
    dest.create(dest.NORMAL_FILE_TYPE, 0o644);
  }
  do_check_true(dest.exists());
  let source = getUpdatesRootDir();
  source.append("active-update.xml");
  unlink(source.path);
  let ret = symlink(dest.path, source.path);
  do_check_eq(ret, 0);
  do_check_true(source.exists());

  // Symlink updates/
  let dest2 = getAppDir();
  dest2.append("updates");
  if (dest2.exists()) {
    dest2.remove(true);
  }
  dest2.create(dest.DIRECTORY_TYPE, 0o755);
  do_check_true(dest2.exists());
  let source2 = getUpdatesRootDir();
  source2.append("updates");
  if (source2.exists()) {
    source2.remove(true);
  }
  ret = symlink(dest2.path, source2.path);
  do_check_eq(ret, 0);
  do_check_true(source2.exists());

  // Cleanup the symlinks when the test is finished.
  do_register_cleanup(function AUFIBD_cleanup() {
    logTestInfo("start - unlinking symlinks");
    let ret = unlink(source.path);
    do_check_false(source.exists());
    let ret = unlink(source2.path);
    do_check_false(source2.exists());
    logTestInfo("finish - unlinking symlinks");
  });

  // Now, make sure that getUpdatesRootDir returns the application bundle
  // directory, to make the various stuff in the test framework to work
  // correctly.
  getUpdatesRootDir = getAppDir;
}

/**
 * This function copies the entire process directory over to a new one which we
 * can write to, so that we can test under Windows which holds locks on opened
 * files.
 */
function adjustPathsOnWindows() {
  logTestInfo("start - setup new process directory");
  // We copy the entire GRE directory into another location so that xpcshell
  // running doesn't prevent the updater from moving stuff around.
  let tmpDir = do_get_profile();
  tmpDir.append("ExecutableDir.tmp");
  tmpDir.createUnique(tmpDir.DIRECTORY_TYPE, 0o755);
  let procDir = getCurrentProcessDir();
  logTestInfo("start - copy the process directory");
  copyMinimumAppFiles(procDir, tmpDir, "bin");
  logTestInfo("finish - copy the process directory");
  let newDir = tmpDir.clone();
  newDir.append("bin");
  gWindowsBinDir = newDir;
  logTestInfo("Using this new bin directory: " + gWindowsBinDir.path);
  // Note that this directory will be deleted as part of the xpcshell teardown,
  // so we don't need to remove it explicitly.

  // We need to make NS_GRE_DIR point to the new bindir, since
  // nsUpdateProcessor::ProcessUpdate uses NS_GRE_DIR to construct the
  // destination path name which would be passed to updater.exe.
  let dirProvider = {
    getFile: function DP_getFile(prop, persistent) {
      persistent.value = true;
      if (prop == NS_GRE_DIR)
        return getAppDir();
      return null;
    },
    QueryInterface: function(iid) {
      if (iid.equals(AUS_Ci.nsIDirectoryServiceProvider) ||
          iid.equals(AUS_Ci.nsISupports))
        return this;
      throw AUS_Cr.NS_ERROR_NO_INTERFACE;
    }
  };
  let ds = Services.dirsvc.QueryInterface(AUS_Ci.nsIDirectoryService);
  ds.QueryInterface(AUS_Ci.nsIProperties).undefine(NS_GRE_DIR);
  ds.registerProvider(dirProvider);
  do_register_cleanup(function APOW_cleanup() {
    logTestInfo("start - unregistering directory provider");
    ds.unregisterProvider(dirProvider);
    logTestInfo("finish - unregistering directory provider");
  });
  logTestInfo("finish - setup new process directory");
}

let gWindowsBinDir = null;

/**
 * This function makes XREExeF and UpdRootD point to unique locations so
 * xpcshell tests can run in parallel.
 */
function adjustGeneralPaths() {
  let dirProvider = {
    getFile: function DP_getFile(prop, persistent) {
      persistent.value = true;
      if (prop == XRE_EXECUTABLE_FILE)
        return do_get_file(getApplyDirPath() + "test" + APP_BIN_SUFFIX, true);
      if (prop == XRE_UPDATE_ROOT_DIR)
        return do_get_file(getApplyDirPath(), true);
      return null;
    },
    QueryInterface: function(iid) {
      if (iid.equals(AUS_Ci.nsIDirectoryServiceProvider) ||
          iid.equals(AUS_Ci.nsISupports))
        return this;
      throw AUS_Cr.NS_ERROR_NO_INTERFACE;
    }
  };
  let ds = Services.dirsvc.QueryInterface(AUS_Ci.nsIDirectoryService);
  ds.registerProvider(dirProvider);
  do_register_cleanup(function() {
    // Call end_test first before the directory provider is unregistered
    end_test();
    ds.unregisterProvider(dirProvider);
    let testBin = do_get_file(getApplyDirPath() + "test" + APP_BIN_SUFFIX, true);
    // Try to remove the test.bin file if it exists (it shouldn't).
    if (testBin.exists()) {
      try {
        testBin.remove(false);
      }
      catch (e) {
        dump("Unable to remove file\n" +
             "path: " + testBin.path + "\n" +
             "Exception: " + e + "\n");
      }
    }
    let testDir = do_get_file(getApplyDirPath(), true).parent;
    // Try to remove the directory used to apply updates (this is non-fatal
    // for the test).
    if (testDir.exists()) {
      try {
        removeDirRecursive(testDir);
      }
      catch (e) {
        dump("Unable to remove directory\n" +
             "path: " + testDir.path + "\n" +
             "Exception: " + e + "\n");
      }
    }
  });
}

/**
 * This function returns the current process directory on Windows and Linux, and
 * the application bundle directory on Mac.
 */
function getAppDir() {
  let dir = getCurrentProcessDir();
  if (shouldAdjustPathsOnMac()) {
    // objdir/dist/bin/../NightlyDebug.app/Contents/MacOS
    dir = dir.parent;
    dir.append(BUNDLE_NAME);
    dir.append("Contents");
    dir.append("MacOS");
  } else if (IS_WIN && gWindowsBinDir) {
    dir = gWindowsBinDir.clone();
  }
  return dir;
}

/**
 * The observer for the call to nsIProcess:runAsync.
 */
let gProcessObserver = {
  observe: function PO_observe(subject, topic, data) {
    logTestInfo("topic " + topic + ", process exitValue " + gProcess.exitValue);
    if (gAppTimer) {
      gAppTimer.cancel();
      gAppTimer = null;
    }
    if (topic != "process-finished" || gProcess.exitValue != 0) {
      do_throw("Failed to launch application");
    }
    do_timeout(TEST_CHECK_TIMEOUT, checkUpdateFinished);
  },
  QueryInterface: XPCOMUtils.generateQI([AUS_Ci.nsIObserver])
};

/**
 * The timer callback to kill the process if it takes too long.
 */
let gTimerCallback = {
  notify: function TC_notify(aTimer) {
    gAppTimer = null;
    if (gProcess.isRunning) {
      gProcess.kill();
    }
    do_throw("launch application timer expired");
  },
  QueryInterface: XPCOMUtils.generateQI([AUS_Ci.nsITimerCallback])
};

/**
 * The update-staged observer for the call to nsIUpdateProcessor:processUpdate.
 */
let gUpdateStagedObserver = {
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "update-staged") {
      Services.obs.removeObserver(gUpdateStagedObserver, "update-staged");
      checkUpdateApplied();
    }
  },
  QueryInterface: XPCOMUtils.generateQI([AUS_Ci.nsIObserver])
};

// Environment related globals
let gShouldResetEnv = undefined;
let gAddedEnvXRENoWindowsCrashDialog = false;
let gEnvXPCOMDebugBreak;
let gEnvXPCOMMemLeakLog;
let gEnvDyldLibraryPath;
let gEnvLdLibraryPath;
let gEnvUpdateRootOverride = null;
let gEnvAppDirOverride = null;
let gEnvSKipUpdateDirHashing = false;

/**
 * Sets the environment that will be used by the application process when it is
 * launched.
 */
function setEnvironment() {
  // Prevent setting the environment more than once.
  if (gShouldResetEnv !== undefined)
    return;

  gShouldResetEnv = true;

  let env = AUS_Cc["@mozilla.org/process/environment;1"].
            getService(AUS_Ci.nsIEnvironment);
  if (IS_WIN && !env.exists("XRE_NO_WINDOWS_CRASH_DIALOG")) {
    gAddedEnvXRENoWindowsCrashDialog = true;
    logTestInfo("setting the XRE_NO_WINDOWS_CRASH_DIALOG environment " +
                "variable to 1... previously it didn't exist");
    env.set("XRE_NO_WINDOWS_CRASH_DIALOG", "1");
  }

  if (IS_UNIX) {
    let appGreDir = Services.dirsvc.get("GreD", AUS_Ci.nsIFile);
    let envGreDir = AUS_Cc["@mozilla.org/file/local;1"].
                    createInstance(AUS_Ci.nsILocalFile);
    let shouldSetEnv = true;
    if (IS_MACOSX) {
      if (env.exists("DYLD_LIBRARY_PATH")) {
        gEnvDyldLibraryPath = env.get("DYLD_LIBRARY_PATH");
        envGreDir.initWithPath(gEnvDyldLibraryPath);
        if (envGreDir.path == appGreDir.path) {
          gEnvDyldLibraryPath = null;
          shouldSetEnv = false;
        }
      }

      if (shouldSetEnv) {
        logTestInfo("setting DYLD_LIBRARY_PATH environment variable value to " +
                    appGreDir.path);
        env.set("DYLD_LIBRARY_PATH", appGreDir.path);
      }
    }
    else {
      if (env.exists("LD_LIBRARY_PATH")) {
        gEnvLdLibraryPath = env.get("LD_LIBRARY_PATH");
        envGreDir.initWithPath(gEnvLdLibraryPath);
        if (envGreDir.path == appGreDir.path) {
          gEnvLdLibraryPath = null;
          shouldSetEnv = false;
        }
      }

      if (shouldSetEnv) {
        logTestInfo("setting LD_LIBRARY_PATH environment variable value to " +
                    appGreDir.path);
        env.set("LD_LIBRARY_PATH", appGreDir.path);
      }
    }
  }

  if (env.exists("XPCOM_MEM_LEAK_LOG")) {
    gEnvXPCOMMemLeakLog = env.get("XPCOM_MEM_LEAK_LOG");
    logTestInfo("removing the XPCOM_MEM_LEAK_LOG environment variable... " +
                "previous value " + gEnvXPCOMMemLeakLog);
    env.set("XPCOM_MEM_LEAK_LOG", "");
  }

  if (env.exists("XPCOM_DEBUG_BREAK")) {
    gEnvXPCOMDebugBreak = env.get("XPCOM_DEBUG_BREAK");
    logTestInfo("setting the XPCOM_DEBUG_BREAK environment variable to " +
                "warn... previous value " + gEnvXPCOMDebugBreak);
  }
  else {
    logTestInfo("setting the XPCOM_DEBUG_BREAK environment variable to " +
                "warn... previously it didn't exist");
  }

  env.set("XPCOM_DEBUG_BREAK", "warn");

  if (IS_WIN && gEnvSKipUpdateDirHashing) {
    env.set("MOZ_UPDATE_NO_HASH_DIR", "1");
  }

  if (gEnvUpdateRootOverride) {
    logTestInfo("setting the MOZ_UPDATE_ROOT_OVERRIDE environment variable to " +
                gEnvUpdateRootOverride + "\n");
    env.set("MOZ_UPDATE_ROOT_OVERRIDE", gEnvUpdateRootOverride);
  }

  if (gEnvAppDirOverride) {
    logTestInfo("setting the MOZ_UPDATE_APPDIR_OVERRIDE environment variable to " +
                gEnvAppDirOverride + "\n");
    env.set("MOZ_UPDATE_APPDIR_OVERRIDE", gEnvAppDirOverride);
  }

  if (gBackgroundUpdate) {
    logTestInfo("setting the MOZ_UPDATE_BACKGROUND environment variable to 1\n");
    env.set("MOZ_UPDATE_BACKGROUND", "1");
  }

  logTestInfo("setting MOZ_NO_SERVICE_FALLBACK environment variable to 1");
  env.set("MOZ_NO_SERVICE_FALLBACK", "1");
}

/**
 * Sets the environment back to the original values after launching the
 * application.
 */
function resetEnvironment() {
  // Prevent resetting the environment more than once.
  if (gShouldResetEnv !== true)
    return;

  gShouldResetEnv = false;

  let env = AUS_Cc["@mozilla.org/process/environment;1"].
            getService(AUS_Ci.nsIEnvironment);

  if (gEnvXPCOMMemLeakLog) {
    logTestInfo("setting the XPCOM_MEM_LEAK_LOG environment variable back to " +
                gEnvXPCOMMemLeakLog);
    env.set("XPCOM_MEM_LEAK_LOG", gEnvXPCOMMemLeakLog);
  }

  if (gEnvXPCOMDebugBreak) {
    logTestInfo("setting the XPCOM_DEBUG_BREAK environment variable back to " +
                gEnvXPCOMDebugBreak);
    env.set("XPCOM_DEBUG_BREAK", gEnvXPCOMDebugBreak);
  }
  else {
    logTestInfo("clearing the XPCOM_DEBUG_BREAK environment variable");
    env.set("XPCOM_DEBUG_BREAK", "");
  }

  if (IS_UNIX) {
    if (IS_MACOSX) {
      if (gEnvDyldLibraryPath) {
        logTestInfo("setting DYLD_LIBRARY_PATH environment variable value " +
                    "back to " + gEnvDyldLibraryPath);
        env.set("DYLD_LIBRARY_PATH", gEnvDyldLibraryPath);
      }
      else {
        logTestInfo("removing DYLD_LIBRARY_PATH environment variable");
        env.set("DYLD_LIBRARY_PATH", "");
      }
    }
    else {
      if (gEnvLdLibraryPath) {
        logTestInfo("setting LD_LIBRARY_PATH environment variable value back " +
                    "to " + gEnvLdLibraryPath);
        env.set("LD_LIBRARY_PATH", gEnvLdLibraryPath);
      }
      else {
        logTestInfo("removing LD_LIBRARY_PATH environment variable");
        env.set("LD_LIBRARY_PATH", "");
      }
    }
  }

  if (IS_WIN && gAddedEnvXRENoWindowsCrashDialog) {
    logTestInfo("removing the XRE_NO_WINDOWS_CRASH_DIALOG environment " +
                "variable");
    env.set("XRE_NO_WINDOWS_CRASH_DIALOG", "");
  }

  if (gEnvUpdateRootOverride) {
    logTestInfo("removing the MOZ_UPDATE_ROOT_OVERRIDE environment variable\n");
    env.set("MOZ_UPDATE_ROOT_OVERRIDE", "");
    gEnvUpdateRootOverride = null;
  }

  if (gEnvAppDirOverride) {
    logTestInfo("removing the MOZ_UPDATE_APPDIR_OVERRIDE environment variable\n");
    env.set("MOZ_UPDATE_APPDIR_OVERRIDE", "");
    gEnvAppDirOverride = null;
  }

  if (gBackgroundUpdate) {
    logTestInfo("removing the MOZ_UPDATE_BACKGROUND environment variable\n");
    env.set("MOZ_UPDATE_BACKGROUND", "");
  }

  logTestInfo("removing MOZ_NO_SERVICE_FALLBACK environment variable");
  env.set("MOZ_NO_SERVICE_FALLBACK", "");
}
