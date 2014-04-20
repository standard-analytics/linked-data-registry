var util = require('util')
  , path = require('path')
  , AWS = require('aws-sdk')
  , postPublish = require('./lib/postpublish')
  , nano = require('nano')
  , cqs = require('cqs');

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});

var couch = {
  ssl: process.env['COUCH_SSL'],
  host: process.env['COUCH_HOST'],
  port: process.env['COUCH_PORT'],
  registry: (process.env['REGISTRY_DB_NAME'] || 'registry'),
  queue: (process.env['QUEUE_DB_NAME'] || 'cqs_queue')
};

var admin = { username: process.env['COUCH_USER'], password: process.env['COUCH_PASS'] };

var rootCouch = util.format('%s://%s:%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port) //https is optional so that we can play localy without SSL. That being said, in production it should be 1!
  , rootCouchAdmin = util.format('%s://%s:%s@%s:%d', (couch.ssl == 1) ? 'https': 'http', admin.username, admin.password, couch.host, couch.port)
  , rootCouchRegistry = util.format('%s://%s:%s/%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port, couch.registry);

var nano = require('nano')(rootCouchAdmin); //connect as admin
var registry = nano.db.use(couch.registry)

cqs = cqs.defaults({ "couch": rootCouchAdmin, "db": couch.queue });

s3.createBucket(function(err, data) {
  if(err) throw err;
  console.log('S3 bucket (%s) OK', bucket);

  cqs.ListQueues(function(err, queues) {
    if(err) throw err;

    if(!queues.length) throw new Error('no queues');

    var queue = queues[0];

    console.log('queue (%s) OK', queues[0].name);

    function processMsg(){
      queue.receive(function(err, msgs) {

        if(err){
          console.error(err);
          return setTimeout(processMsg, 10000);
        }

        if(!msgs.length){
          return setTimeout(processMsg, 10000);
        }

        var msg = msgs[0];

        postPublish({rootCouchRegistry: rootCouchRegistry, admin: admin, s3: s3}, msg.Body, function(err, pkg, rev){
          if(err){
            console.error(err);
            return msg.del(function(err) { processMsg();});
          }

          registry.atomic('registry', 'postpublish', pkg._id, pkg, function(err, bodyPost, headersPost){
            if(err){
              console.error(err, bodyPost);
            }
            msg.del(function(err) { processMsg(); });
          });

        });

      });
    };

    processMsg();

  });

});


//it('should have added about', function(done){
//  request.get(rurl('/test-readme/0.0.0'), function(err, resp, body){
//    body = JSON.parse(body);
//    assert.deepEqual(body.about, { name: 'README.md', url: 'test-readme/0.0.0/about/README.md' });
//    done();
//  });
//});
//
////test dataset
//assert.equal(body.dataset[1].distribution.hashValue, crypto.createHash('sha1').update(JSON.stringify(pkg.dataset[0].distribution.contentData)).digest('hex'));
//zlib.gzip(JSON.stringify(pkg.dataset[0].distribution.contentData), function(err, data){
//  var sha1 = crypto.createHash('sha1').update(data).digest('hex');
//  assert.equal(body.dataset[1].distribution.encoding.hashValue, sha1);
//  assert.equal(body.dataset[1].distribution.contentUrl, 'r/' + sha1);
//  done();
//})
//
//
//assert.equal(body.thumbnailUrl, 'test-pkg/0.0.0/thumbnail/thumb-fig-256.jpeg');