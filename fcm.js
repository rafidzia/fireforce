/**
 * @param {String} topicOrToken - The string topic name or the device token.
 * @param {string} data - The string
 */

var fAdmin = require("firebase-admin");
var serviceAccount = require("./fireman-78f71-firebase-adminsdk-eamnk-c88348104f.json");

fAdmin.initializeApp({
    credential: fAdmin.credential.cert(serviceAccount)
})

exports.send = (topicOrToken, data = false, notification = false, callback = false)=>{
    let payload = {};
    if(data){
        payload.data = data;
    }
    if(notification){
        payload.notification = notification;
    }
    let options = {
        priority: 'high',
        timeToLive: 60 * 60 * 24, // 1 day
    };
    if(topicOrToken.indexOf("/") > -1){
        fAdmin.messaging().sendToTopic(topicOrToken, payload, options)
            .then((response) => {
                console.log("Successfully sent message:", response);
                if(callback) callback(null, response)
            })
            .catch((error) => {
                console.log("Error sending message:", error);
                if(callback) callback(error, null)
            });
    }else{
        fAdmin.messaging().sendToDevice(topicOrToken, payload, options)
            .then((response) => {
                console.log("Successfully sent message:", response);
                if(callback) callback(null, response)
            })
            .catch((error) => {
                console.log("Error sending message:", error);
                if(callback) callback(error, null)
            });
    }
}
