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
var configFile = path.join(path.dirname(process.execPath), 'config.json');
var connection, prefix;

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

var execTool = function() {
  var host = $("#host").val();
  var port = $("#port").val();
  var user = $("#user").val();
  var passwd = $("#passwd").val();
  var dbname = $("#dbname").val();
  var xml = $("#xml").val();
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
  if (xml.length <= 0) {
    msg(1, "请先指定XML输出目录!");
    return false;
  }

  if (!fs.existsSync(xml)) {
    msg(1, "XML输出目录不存在！");
    return false;
  }

  if (!fs.statSync(xml).isDirectory()) {
    msg(1, "XML输出目录不是目录！");
    return false;
  }

  connection = mysql.createConnection({
    host: host,
    port: port,
    user: user,
    password: passwd,
    database: dbname
  });

  async.waterfall([
    function(cb) {
      msg(2, "正在执行...");
      $("#execButton").attr('disabled', "true");
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
            callback(err);
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
          var xmlFile = path.join(xml, tblName + ".xml");
          if (dataLen <= 0) {
            fs.writeFileSync(xmlFile, xb.end({ pretty: true}));
            callback(null);
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
              callback(e);
              return;
            }
            //item = tab.ele(pName, tmp);
          }

          fs.writeFileSync(xmlFile, xb.end({ pretty: true}));
          callback(null);
        });
      }, cb);
    }
  ], function(err) {
    connection.end();
    $("#execButton").removeAttr('disabled');
    if (err) {
      msg(1, "执行错误：" + err);
      msg(2, "执行中有错误！");
      return;
    }
    msg(2, "执行成功！");
  });
};

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
  }

  win.show();
});



