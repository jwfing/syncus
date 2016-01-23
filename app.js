'use strict';
var domain = require('domain');
var cookieSession = require('cookie-session')
var express = require('express');
var moment = require('moment-timezone');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var todos = require('./routes/todos');
var cloud = require('./cloud');
var flash = require('./flash');
var AV = require('leanengine');

var app = express();

// 设置 view 引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// 加载云代码方法
app.use(cloud);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cookieSession({
  name: 'session',
  keys: ['foo', 'bar']
}))

app.use(AV.Cloud.CookieSession({ secret: '05b88fe4d66e1e6a80f557186d055949', maxAge: 3600000, fetchUser: true }));
app.use(flash());
app.use(checkAuth);

function checkAuth(req, res, next) {
  if (req.path === '/login' ||
      req.path === '/register' ||
      req.path === '/badluck' ||
      req.path.search('/js') === 0 ||
      req.path.search('/stylesheets') === 0) {
    next();
  } else if (!AV.User.current()) {
    res.redirect('/login');
  } else {
    next();
  }
}

// 未处理异常捕获 middleware
app.use(function(req, res, next) {
  var d = null;
  if (process.domain) {
    d = process.domain;
  } else {
    d = domain.create();
  }
  d.add(req);
  d.add(res);
  d.on('error', function(err) {
    console.error('uncaughtException url=%s, msg=%s', req.url, err.stack || err.message || err);
    if(!res.finished) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=UTF-8');
      res.end('uncaughtException');
    }
  });
  d.run(next);
});

app.get('/', function(req, res) {
  res.redirect('/login');
});

app.post('/login', function(req, res, next) {
  AV.User.logIn(req.body.username, req.body.password, {
    success: function(user) {
      res.redirect('/todos');
    },
    error: function(user, error) {
      console.log('[ERROR] /login failed: %j', error.message);
      req.flash('errors', error.message);
      res.redirect('/login');
    }
  });
});

app.get('/login', function(req, res, next) {
  res.render('login', {
    errors: req.flash('errors'),
    info: req.flash('info')
  });
});

app.post('/logout', function(req, res, next) {
  req.session = null;
  AV.User.logOut();
  req._avos_session = null;
  res.redirect('/login');
});

app.get('/register', function(req, res, next) {
  res.render('register', {errors: req.flash('errors')});
});

app.post('/register', function(req, res, next) {
  if (req.body.password !== req.body.repeat_password) {
    req.flash('errors', '两次密码输入不一致！');
    res.redirect('/register');
    return;
  }
  if (req.body.password.length < 6) {
    req.flash('errors', '密码至少要六位！');
    res.redirect('/register');
    return;
  }

  var user = new AV.User();
  user.setUsername(req.body.username);
  user.setEmail(req.body.username);
  user.setPassword(req.body.password);

  user.signUp(null, {
    success: function(user) {
      res.redirect('/login');
    },
    error: function(user, error) {
      console.log('[ERROR] /register failed: %j', error.message);
      req.flash('error', error.message);
      res.redirect('/register');
    }
  });
});

app.post('/badluck', function( req, res ){
  var username = req.body.username;
  AV.User.requestPasswordReset( username, {
    success: function() {
      req.flash('info','密码重设成功，请去邮箱 ' + username + ' 重设密码');
      res.redirect('/login');
    },
    error: function(error) {
      console.log( '[ERROR] /badluck failed: ' + error.message);
      req.flash('errors','重设密码失败，用户名' + username + '是正确的吗？');
      res.redirect('/login');
    }
  });
})

// 可以将一类的路由单独保存在一个文件中
app.use('/todos', todos);

// 如果任何路由都没匹配到，则认为 404
// 生成一个异常让后面的 err handler 捕获
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// 如果是开发环境，则将异常堆栈输出到页面，方便开发调试
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) { // jshint ignore:line
    var statusCode = err.status || 500;
    if(statusCode === 500) {
      console.error(err.stack || err);
    }
    res.status(statusCode);
    res.render('error', {
      message: err.message || err,
      error: err
    });
  });
}

// 如果是非开发环境，则页面只输出简单的错误信息
app.use(function(err, req, res, next) { // jshint ignore:line
  res.status(err.status || 500);
  res.render('error', {
    message: err.message || err,
    error: {}
  });
});

module.exports = app;
