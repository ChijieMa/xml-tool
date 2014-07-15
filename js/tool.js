/**
 * Created by dongxuehai on 14-5-20.
 */

'use strict';

var gui = require('nw.gui');
var win = gui.Window.get();
var fs = require('fs');
var mysql = require('mysql');
var async = require('async');
var path = require('path');
var xmlBuilder = require('xmlbuilder');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var configFile = path.join(path.dirname(process.execPath), 'config.json');
var connection, prefix, host, port, user, passwd, dbname, xml;
var checkedArr = [];

var loadXmlPath = function() {
  var xmlPath = $("#xml-path")[0].files[0].path;
  $("#xml").val(xmlPath);
};

function formatObj(obj) {
  var newObj = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      newObj[k] = obj[k] === null ? '' : obj[k];
    }
  }
  return newObj;
}

function msg(type, msg) {
  var info = "<p>" + msg + "</p>";
  if (type === 1) {
    $("#errMsg").append(info);
  }
  if (type === 2) {
    $("#msg").append(info);
  }
}

function checkInput(opt) {
  opt = opt || {};
  host = $("#host").val();
  port = $("#port").val();
  user = $("#user").val();
  passwd = $("#passwd").val();
  dbname = $("#dbname").val();
  xml = $("#xml").val();
  $("#errMsg").html('');
  $("#msg").html('');
  if (host.length <= 0) {
    msg(1, "MYSQL数据库主机不能为空!");
    return false;
  }
  if (port.length <= 0) {
    msg(1, "MYSQL数据库端口不能为空!");
    return false;
  }
  if (user.length <= 0) {
    msg(1, "MYSQL数据库账号不能为空!");
    return false;
  }
  if (passwd.length <= 0) {
    msg(1, "MYSQL数据库密码不能为空!");
    return false;
  }
  if (dbname.length <= 0) {
    msg(1, "MYSQL数据库库名不能为空!");
    return false;
  }
  if (!opt.xml && xml.length <= 0) {
    msg(1, "请先指定XML输出目录!");
    return false;
  }

  if (!opt.xml && !fs.existsSync(xml)) {
    msg(1, "XML输出目录不存在！");
    return false;
  }

  if (!opt.xml && !fs.statSync(xml).isDirectory()) {
    msg(1, "XML输出目录不是目录！");
    return false;
  }
  return true;
}

function checkedList() {
  checkedArr = [];
  $("#tbs :checkbox").each(function() {
    if ($(this).is(":checked")) {
      checkedArr.push($(this).val());
    }
  });
}

function connectDb() {
  connection = mysql.createConnection({
    host: host,
    port: port,
    user: user,
    password: passwd,
    database: dbname
  });
}

/**
 * 导出xml
 * @returns {boolean}
 */
var exportXml = function() {
  if (!checkInput()) {
    return false;
  }

  checkedList();
  connectDb();

  async.waterfall([
    function(cb) {
      msg(2, "正在执行...");
      $("#exportXml").attr('disabled', "true");
      connection.connect(cb);
    },
    function(conInfo, cb) {
      var sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA='" + dbname + "'";
      connection.query(sql, function(err, rows) {
        if (err) {
          cb(err);
          return;
        }
        cb(null, rows);
      });
    },
    function(tbls, cb) {
      async.each(tbls, function(tbl, callback) {
        var tblName = tbl.TABLE_NAME;
        if (prefix && tblName.indexOf(prefix) !== 0) {
          callback(null);
          return;
        }

        if (checkedArr.length > 0 && checkedArr.indexOf(tblName) === -1) {
          callback(null);
          return;
        }

        exportSingleXml(tblName, xml, callback);
      }, cb);
    }
  ], function(err) {
    connection.end();
    $("#exportXml").removeAttr('disabled');
    if (err) {
      msg(1, "执行错误：" + err);
      msg(2, "执行中有错误！");
      return;
    }
    msg(2, "执行成功！");
  });
};

/**
 * 导入XML
 */
var importXml = function() {
  if (!checkInput()) {
    return false;
  }

  checkedList();
  connectDb();
  var backXmlPath;

  async.waterfall([
    function(cb) {
      msg(2, "正在执行...");
      $("#importXml").attr('disabled', 'true');
      connection.connect(cb);
    },
    function(conInfo, cb) {
      var d = dateFormat(new Date(), 'yyyyMMddhhmmss');
      backXmlPath = path.join(path.dirname(process.execPath), d);
      fs.exists(backXmlPath, function(exists) {
        if (!exists) {
          fs.mkdir(backXmlPath, cb);
        }
      });
    },
    function(cb) {
      fs.readdir(xml, cb);
    },
    function(files, cb) {
      async.each(files, function(file, callback) {
        if (prefix && file.indexOf(prefix) !== 0) {
          callback(null);
          return;
        }
        var lid = file.lastIndexOf('.');
        if (lid <= 0 || file.substring(lid + 1) !== 'xml') {
          callback(null);
          return;
        }
        var tabname = file.substring(0, lid);

        if (checkedArr.length > 0 && checkedArr.indexOf(tabname) === -1) {
          callback(null);
          return;
        }

        async.waterfall([
          function(cbk) {
            exportSingleXml(tabname, backXmlPath, cbk);
          },
          function(cbk) {
            connection.query("truncate table " + tabname, function(err) {
              if (err) {
                cbk(err);
                return;
              }
              cbk(null);
            });
          },
          function(cbk) {
            var xmlFile = path.join(xml, file);
            fs.readFile(xmlFile, function(err, data) {
              if (err) {
                cbk(err);
                return;
              }
              parser.parseString(data, function(err, res){
                if (err) {
                  cbk(err);
                  return;
                }
                cbk(null, res);
              });
            });
          },
          function(res, cbk) {
            var dataArr = res.gamecfg[tabname][0];
            var retArr = [];
            for (var k in dataArr) {
              var dt = dataArr[k][0]['$'];
              retArr.push(dt);
            }

            async.each(retArr, function(ret, cllbk) {
              var keyArr = [];
              var valArr = [];
              for (var i in ret) {
                keyArr.push(i);
                valArr.push(mysql.escape(ret[i]));
              }
              var field = "`" + keyArr.join('`,`') + "`";
              var val = valArr.join(",");
              var sql = "insert into " + tabname + "(" + field + ") values(" + val + ")";
              connection.query(sql, function(err) {
                if (err) {
                  msg(1, sql);
                  cllbk(err);
                  return;
                }
                cllbk(null);
              });
            }, cbk);
          }
        ], function(err) {
          if (err) {
            callback(err);
            return;
          }
          callback(null);
        });
      }, cb);
    }
  ], function(err) {
    connection.end();
    $("#importXml").removeAttr('disabled');
    if (err) {
      msg(1, "执行错误：" + err);
      msg(2, "执行中有错误！");
      return;
    }
    msg(2, "执行成功！");
  });
};

/**
 * 导出单个XML文件
 */
function exportSingleXml(tblName, xmlPath, cb) {
  var sqlArr = [
    "select COLUMN_NAME,COLUMN_COMMENT from information_schema.columns where" +
      " table_schema='" + dbname + "' and table_name='" + tblName + "' order by ORDINAL_POSITION asc",
    "select * from " + tblName
  ];
  async.map(sqlArr, function(sql, ncb) {
    connection.query(sql, function(err, rows) {
      if (err) {
        msg(1, sql);
        ncb(err);
        return;
      }
      ncb(null, rows);
    });
  }, function(err, results) {
    if (err) {
      cb(err);
      return;
    }
    var xb = xmlBuilder.create('gamecfg', {
      encoding: "UTF-8"
    });
    var commentArr = results[0];
    var commentLen = commentArr.length;
    var commentStr = '', i;
    for (i = 0; i < commentLen; i++) {
      commentStr += "[" + commentArr[i].COLUMN_NAME + "=" + commentArr[i].COLUMN_COMMENT + "]";
    }
    xb.com(commentStr);
    var tab = xb.ele(tblName);
    var item;
    var dataArr = results[1];
    var dataLen = dataArr.length;
    var xmlFile = tblName + ".xml";
    xmlFile = path.join(xmlPath, xmlFile);
    if (dataLen <= 0) {
      fs.writeFileSync(xmlFile, xb.end({ pretty: true}));
      cb(null);
      return;
    }
    var pKey = commentArr[0].COLUMN_NAME;
    var pName;
    for (i = 0; i < dataLen; i++) {
      pName = pKey + "_" + dataArr[i][pKey];
      var tmp = formatObj(dataArr[i]);
      try {
        item = tab.ele(pName, tmp);
      } catch (e) {
        msg(1, JSON.stringify(tmp));
        msg(1, e);
        msg(1, e.stack);
        cb(e);
        return;
      }
      //item = tab.ele(pName, tmp);
    }

    fs.writeFileSync(xmlFile, xb.end({ pretty: true}));
    cb(null);
  });
}

/**
 * 格式化时间
 * @param date
 * @param format
 * @returns {*}
 */
function dateFormat(date, format) {
  var o = {
    "M+": date.getMonth() + 1, //月份
    "d+": date.getDate(), //日
    "h+": date.getHours(), //小时
    "m+": date.getMinutes(), //分
    "s+": date.getSeconds(), //秒
    "q+": Math.floor((date.getMonth() + 3) / 3), //季度
    "S": date.getMilliseconds() //毫秒
  };
  if (/(y+)/.test(format)) {
    format = format.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
  }
  for (var k in o) {
    if (new RegExp("(" + k + ")").test(format)) {
      format = format.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    }
  }
  return format;
}

/**
 * 更新数据表
 * @returns {boolean}
 */
function updateTab() {
  if (!checkInput({xml: true})) {
    return false;
  }

  connectDb();

  var tabArr = [];

  async.waterfall([
    function(cb) {
      $("#updateTab").attr('disabled', 'true');
      connection.connect(cb);
    },
    function(conInfo, cb) {
      var sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA='" + dbname + "'";
      connection.query(sql, function(err, rows) {
        if (err) {
          cb(err);
          return;
        }
        cb(null, rows);
      });
    },
    function (tbls, cb) {
      async.each(tbls, function(tbl, callback) {
        var tblName = tbl.TABLE_NAME;
        if (prefix && tblName.indexOf(prefix) !== 0) {
          callback(null);
          return;
        }
        tabArr.push(tblName);
        callback(null);
      }, cb);
    }
  ], function(err) {
    connection.end();
    $("#updateTab").removeAttr('disabled');
    if (err) {
      $("#tbs").html(err);
      return;
    }
    var tbsHtml = '';
    tabArr.forEach(function(tab) {
      tbsHtml += "<p><input type='checkbox'value='" + tab + "'>" + tab + "</p>";
    });
    $('#tbs').html(tbsHtml);
  });
}

/**
 * 清除选中
 */
function clearSelect() {
  $("#tbs :checkbox").each(function() {
    if ($(this).is(":checked")) {
      $(this).attr("checked", false);
    }
  });
}

$(document).ready(function(){
  $("#closeButton").mouseover(function() {
    $(this).attr("src","./img/close_hover.png");
  });

  $("#closeButton").mouseout(function() {
    $(this).attr("src","./img/close.png");
  });

  $("#closeButton").click(function() {
    win.close();
  });

  if (fs.existsSync(configFile)) {
    var config = require(configFile);
    $('#host').val(config.host);
    $('#port').val(config.port);
    $('#user').val(config.user);
    $('#passwd').val(config.passwd);
    $('#dbname').val(config.dbname);
    prefix = config.prefix;
    updateTab();
  }

  win.show();
});



