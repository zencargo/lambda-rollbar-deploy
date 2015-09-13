var request = require('request');
const URL = "https://api.rollbar.com/api/1/deploy/";
var AWS = require('aws-sdk');
var async = require('async');
var eb = new AWS.ElasticBeanstalk();
var secret = require("./secret.json");

exports.handler = function(event, context){
  'use strict';

  // Parse the Message part from the event
  var notification = parseEvent(event.Records[0].Sns);

  // Add the Environment to the Rollbar deploy message
  var rollbar = {};
  rollbar.access_token = secret.rollbar_access_token;
  rollbar.environment = notification.Environment;
  rollbar.local_username = 'Elastic Beanstalk';

  // Load the revision from Elastic Beanstalk
  loadRevision(notification.Application, function(err, revision){

    if(err) return context.fail(err);

    // Set the revision in the Rollbar deploy message
    rollbar.revision = revision;
    // Send the deploy message to Rollbar
    sendRollbarDeploy(rollbar, function(err, result){
      if(err) return context.fail(err);

      if(result.err) {
        context.fail(result.message);
      }

      context.succeed("Successfully send deploy to Rollbar. Environment: " + rollbar.environment + " Revision: "+rollbar.revision);
    })
  });
};

/**
 * Parse the received event by reading the Message field and generate javascript object from it
 * @param event The received sns event
 * @returns the parsed notification
 */
function parseEvent(event) {
  var notification = {};
  var messageLines = event.Message.split("\n");
  async.each(messageLines, function (line) {
    var messageItem = line.split(": ");
    if(messageItem[0] && messageItem[0]!='') {
      notification[messageItem[0]] = messageItem[1].trim();
    }
  });

  return notification;
}

/**
 * Read the revision of the latest released version of the elastic beanstalk application
 * @param applicationName Name of the EB application
 * @param callback Revision hash
 */
var loadRevision = function(applicationName, callback) {
  eb.describeApplicationVersions({ApplicationName: applicationName}, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      return callback(err);
    }

    // get the last version to extract the commit hash
    var lastVersion = data.ApplicationVersions[0];
    var revision = (lastVersion ? lastVersion.VersionLabel : 'Unknown');
    callback(null, revision);
  });
}

/**
 * Send the deploy message to rollback
 * @param notification Notification containing all the deploy information
 * @param callback Result from the rollbar api call
 */
function sendRollbarDeploy(notification, callback) {
  request.post({
    url: 'https://api.rollbar.com/api/1/deploy/',
    form: notification
  }, function (err, httpResponse, body) {
    if (err) return callback(err, null);

    callback(null, JSON.parse(body));
  });
}

