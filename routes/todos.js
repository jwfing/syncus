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
  query.equalTo("status", 0);
  query.equalTo("owner", AV.User.createWithoutData("_User", currentUsr.id));
  query.descending('createdAt');
  query.find({
    success: function(results) {
      var doneQuery = new AV.Query(Todo);
      doneQuery.equalTo("status", 2);
      doneQuery.equalTo("owner", AV.User.createWithoutData("_User", currentUsr.id));
      doneQuery.descending('updatedAt');
      doneQuery.limit(50)
      doneQuery.find({
        success: function(doneItems) {
          res.render('todos', {
            title: req.cookies.syncMail,
            todos: results.map(function(obj) {
              obj.createdAt = moment(obj.createdAt).format("MMM Do YY")
              obj.updatedAt = moment(obj.updatedAt).format("MMM Do YY")
              return obj;
            }),
            dones: doneItems.map(function(obj) {
              obj.createdAt = moment(obj.createdAt).format("MMM Do YY")
              obj.updatedAt = moment(obj.updatedAt).format("MMM Do YY")
              return obj;
            })
          });
        },
        error: function(err) {
          console.error("failed to retrieve finished todo item for user: " + currentUsr.id);
          res.render('todos', {
            title: req.cookies.syncMail,
            todos: results.map(function(obj) {
              obj.createdAt = moment(obj.createdAt).format("MMM Do YY")
              obj.updatedAt = moment(obj.updatedAt).format("MMM Do YY")
              return obj;
            }),
            dones: []
          });
        }
      });
    },
    error: function(err) {
      console.error("failed to retrieve todo item for user: " + currentUsr.id);
      if (err.code === 101) {
        res.render('todos', {
          title: req.cookies.syncMail,
          todos: [],
          dones: []
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
    var todoACL = new AV.ACL(currentUsr);
    todoACL.setPublicReadAccess(false);
    todoACL.setPublicWriteAccess(false);
    todo.setACL(todoACL);
    todo.save(null, {
      success: function(todo) {
        res.redirect('/todos');
      },
      error: function(err) {
        console.error("failed to update todo item. cause: " + err.message)
        next(err);
      }
    })
  }
})

// 完成 Todo 项目
router.post('/done', function(req, res, next) {
  var itemId = req.body.itemId;
  var todo = AV.Object.createWithoutData('Todo', itemId);
  if (itemId.length <= 0) {
     next(new Error("please specific todo item"))
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
