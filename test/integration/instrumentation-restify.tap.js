'use strict';

var path    = require('path')
  , tap     = require('tap')
  , test    = tap.test
  , request = require('request')
  , helper  = require(path.join(__dirname, '..', 'lib', 'agent_helper'))
  ;

test("agent instrumentation of HTTP shouldn't crash when Restify handles a connection",
     function (t) {
  t.plan(8);

  var agent   = helper.instrumentMockedAgent()
    , restify = require('restify')
    , server  = restify.createServer()
    ;

  server.get('/hello/:name', function sayHello(req, res) {
    t.ok(agent.getTransaction(), "transaction should be available in handler");
    res.send('hello ' + req.params.name);
  });

  server.listen(8765, function () {
    t.notOk(agent.getTransaction(), "transaction shouldn't leak into server");

    request.get('http://localhost:8765/hello/friend', function (error, response, body) {
      if (error) return t.fail(error);
      t.notOk(agent.getTransaction(), "transaction shouldn't leak into external request");

      var metric = agent.metrics.getMetric('WebTransaction/Uri/hello/friend');
      t.ok(metric, "request metrics should have been gathered");
      t.equals(metric.stats.callCount, 1, "handler should have been called");
      t.equals(body, '"hello friend"', "data returned by restify should be as expected");

      var found = false;
      agent.environment.toJSON().forEach(function (pair) {
        if (pair[0] === 'Dispatcher' && pair[1] === 'restify') found = true;
      });
      t.ok(found, "should indicate that the Restify dispatcher is in play");

      found = false;
      agent.environment.toJSON().forEach(function (pair) {
        if (pair[0] === 'Framework' && pair[1] === 'restify') found = true;
      });
      t.ok(found, "should indicate that restify itself is in play");

      server.close(function () {
        helper.unloadAgent(agent);
        t.end();
      });
    });
  });
});

test("Restify should still be instrumented when run with SSL", function (t) {
  helper.withSSL(function (error, key, certificate, ca) {
    if (error) {
      t.fail("unable to set up SSL: " + error);
      t.end();
    }

    var agent   = helper.instrumentMockedAgent()
      , restify = require('restify')
      , server  = restify.createServer({key : key, certificate : certificate})
      ;

    server.get('/hello/:name', function sayHello(req, res) {
      t.ok(agent.getTransaction(), "transaction should be available in handler");
      res.send('hello ' + req.params.name);
    });

    server.listen(8443, function () {
      t.notOk(agent.getTransaction(), "transaction shouldn't leak into server");

      request.get({url : 'https://ssl.lvh.me:8443/hello/friend', ca : ca},
                  function (error, response, body) {
        if (error) {
          t.fail(error);
          return t.end();
        }

        t.notOk(agent.getTransaction(),
                "transaction shouldn't leak into external request");

        var metric = agent.metrics.getMetric('WebTransaction/Uri/hello/friend');
        t.ok(metric, "request metrics should have been gathered");
        t.equals(metric.stats.callCount, 1, "handler should have been called");
        t.equals(body, '"hello friend"',
                 "data returned by restify should be as expected");

        var found = false;
        agent.environment.toJSON().forEach(function (pair) {
          if (pair[0] === 'Dispatcher' && pair[1] === 'restify') found = true;
        });
        t.ok(found, "should indicate that the Restify dispatcher is in play");

        found = false;
        agent.environment.toJSON().forEach(function (pair) {
          if (pair[0] === 'Framework' && pair[1] === 'restify') found = true;
        });
        t.ok(found, "should indicate that restify itself is in play");

        server.close(function () {
          helper.unloadAgent(agent);
          t.end();
        });
      });
    });
  });
});
