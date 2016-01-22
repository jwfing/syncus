var router = require('express').Router();
var AV = require('leanengine');
var moment = require('moment-timezone');

// `AV.Object.extend` 方法一定要放在全局变量，否则会造成堆栈溢出。
// 详见： https://leancloud.cn/docs/js_guide.html#对象
var Todo = AV.Object.extend('Todo');

// 查询 Todo 列表
router.get('/', function(req, res, next) {
  var query = new AV.Query(Todo);
  var currentUsr = req.AV.user;
  console.log(currentUsr.get('username'))
  query.equalTo("status", 0);
  query.equalTo("owner", AV.User.createWithoutData("_User", currentUsr.id));
  query.ascending('createdAt');
  query.find({
    success: function(results) {
      res.render('todos', {
        title: currentUsr.get('username'),
        todos: results
      });
    },
    error: function(err) {
      if (err.code === 101) {
        // 该错误的信息为：{ code: 101, message: 'Class or object doesn\'t exists.' }，说明 Todo 数据表还未创建，所以返回空的 Todo 列表。
        // 具体的错误代码详见：https://leancloud.cn/docs/error_code.html
        res.render('todos', {
          title: currentUsr.get('username'),
          todos: []
        });
      } else {
        next(err);
      }
    }
  });
});

// 新增 Todo 项目
router.post('/', function(req, res, next) {
  var content = req.body.content;
  var currentUsr = req.AV.user;
  var todo = new Todo();
  if (content.length <= 0) {
     next(new Error("can't add empty item"))
  } else {
    todo.set('content', content);
    todo.set('status', 0);
    todo.set('owner', AV.User.createWithoutData("_User", currentUsr.id));
    todo.save(null, {
      success: function(todo) {
        res.redirect('/todos');
      },
      error: function(err) {
        next(err);
      }
    })
  }
})

// 新增 Todo 项目
router.post('/done', function(req, res, next) {
  var itemId = req.body.itemId;
  var todo = AV.Object.createWithoutData('Todo', itemId);
  if (itemId.length <= 0) {
     next(new Error("can't add empty item"))
  } else {
    todo.set('status', 2);
    todo.save(null, {
      success: function(todo) {
        res.redirect('/todos');
      },
      error: function(err) {
        next(err);
      }
    })
  }
})

module.exports = router;
