// 2025-02-22

// SA main START
const electron = require('electron')
const fs = require('fs')

let windows_mode = (process.platform == "win32")
let linux_mode   = (process.platform == "linux")
let mac_mode = (process.platform == 'darwin')

let dialog_log = [process.platform]

let SA_path = ""

function toFileProtocol(url) {
  var url_decoded = decodeURIComponent(url)
  if (/^(file|https?)\:/.test(url_decoded))
    return url

// http://stackoverflow.com/questions/14317861/difference-between-escape-encodeuri-encodeuricomponent
// Use encodeURI here.
// Move ":" to "|" conversion outside of encodeURI to avoid being encoded.
// Encode () to avoid issues when used in CSS (eg. background-image).
  return "file:///" + encodeURI(url_decoded.replace(/\\/g, "/")).replace(/^(\w)\:/, "$1|").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function toLocalPath(url) {
  return decodeURIComponent(url.replace(/^file\:\/+/i, ((windows_mode)?"":"/")).replace(/^(\w)[\|\:]/i, "$1:").replace(/[\/\\]/g, ((windows_mode)?"\\":"/")).replace(/\?.+$/, ""));
}

(function () {
  var path, path_final
  var is_SA = /AT_SystemAnimator_v(\d+)(\d)(\d)(\d)\.gadget$/

  var p = process.execArgv

  if (p && p.length && is_SA.test(p[0])) {
    path = toLocalPath(p[0].replace(/[\/\\][^\/\\]+$/, "") + '\\SystemAnimator_webkit.html')
    if (fs.existsSync(path))
      path_final = path
  }

  if (!path_final) {
    let webkit_path = process.execPath;
    let webkit_dir = webkit_path.replace(/[\/\\][^\/\\]+$/, "");
    let webkit_parent_dir = webkit_dir.replace(/[\/\\][^\/\\]+$/, "");

dialog_log.push(webkit_parent_dir)

    path = (fs.existsSync("SystemAnimator_path.txt")) ? fs.readFileSync("SystemAnimator_path.txt", 'utf8').toString().trim() : ""

    if (path && fs.existsSync(path)) {
      path_final = path
    }
    else {
      let f_list = [webkit_parent_dir, webkit_dir];

      if (mac_mode) {
        let f_path = webkit_parent_dir;
        for (let i = 0; i < 3; i++) {
          f_path = f_path.replace(/[\/\\][^\/\\]+$/, "");
          f_list.push(f_path);
        }
      }

      for (var i = 0, i_max = f_list.length; i < i_max; i++) {
        var f = f_list[i]

        var version = 0
        var items = fs.readdirSync(f)
        for (var j = 0, j_length = items.length; j < j_length; j++) {
          var name = items[j]
          if (!is_SA.test(name))
            continue

          var re1 = RegExp.$1
          var re2 = RegExp.$2
          var re3 = RegExp.$3
          var re4 = RegExp.$4

          path = toLocalPath(f + '\\' + name + '\\' + 'SystemAnimator_webkit.html')

dialog_log.push(path)

          if (!fs.existsSync(path))
            continue

          var v = parseInt(re1) * 1000 + parseInt(re2) * 100 + parseInt(re3) * 10 + parseInt(re4)
          if (version < v) {
            version = v
            path_final = path
          }
        }

        if (path_final)
          break
      }
    }
  }

  SA_path = (path_final) ? path_final.replace(/[\/\\][^\/\\]+$/, "") : ""
})();

// END
SA_path = require("path").join(__dirname, "../engine/AT_SystemAnimator_v110350.gadget");
electron.app.setPath("userData", require("path").join(__dirname,"../user-data"));
if (SA_path && fs.existsSync(toLocalPath(SA_path + '\\js\\electron_main.js'))) {
//  electron.dialog.showErrorBox("ERROR: System Animator not found", ""+(process.argv && process.argv.slice(1).join(",")))
//  electron.app.quit()
  eval(fs.readFileSync(toLocalPath(SA_path + '\\js\\electron_main.js')).toString());
}
else {
// linux error dialog is visible only after app is ready
  electron.app.on('ready', function() {
    electron.dialog.showErrorBox("ERROR: System Animator not found", "System Animator cannot be found. Make sure that you download System Animator, unzip it and place the folder alongside the Electron one.\n\n" + dialog_log.join("\n"));
    electron.app.quit();
  });
}
