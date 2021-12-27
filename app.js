
const crypto = require('crypto')
const express = require('express')
const { EventEmitter } = require('events')
const ee = new EventEmitter();
const app = express()
const port = 8001;
const server = app.listen(process.env.PORT || port, function(){
    console.log('server started and listening on port ', port)
});
const io = require('socket.io')(server, {cors: {origin: "*"}})
const aedes = require('aedes')()
const mqttserver = require('net').createServer(aedes.handle)
const netport = 1883

const MongoClient = require("mongodb").MongoClient;
const mongoURL = "mongodb://localhost:27017/";
const mongoOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}
var db;

var fcm = require("./fcm")

MongoClient.connect(mongoURL, mongoOptions, (err, client)=>{
    if(err) throw err;
    console.log("database connected")
    db = client.db("fireforce")
})


mqttserver.listen(netport, function () {
    console.log('mqtt server started and listening on port ', netport)
})
aedes.on('client', function (client) {
    console.log('client connected', client.id)
})

aedes.on('publish', function (packet, client) {
    console.log('publish', packet.topic, packet.payload.toString())
    ee.emit("aedes_" + packet.topic, packet.payload.toString())
})

var publish = (topic, message)=>{
    aedes.publish({
        topic: topic,
        payload: message,
        qos: 0,
        retain: false
    })
}

// setTimeout(() => {
//     publish("test", "test")
// }, 1000)


app.get("/", (req, res) => {
    res.send("asd")
})

// {"floor" : data[1].substring(1, data[1].length - 1), "room" : result[data[1]][data[2]][1]}

ee.on("aedes_/FireSmokeDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data Long,Lat;C1;F1;R1 (Client 1 Floor 1 Room 1)
    let dataupdate = {}
    dataupdate.$set = {}
    dataupdate.$set[`${data[1]}.${data[2]}.0`] = 3
    db.collection("user").updateOne({id : data[0]}, dataupdate, (err, result)=>{
        if(err) throw err;
        io.emit("userConditionChange" + data[0]);
    })

    // io.emit("/user/FireSmokeDetected/" + data[0]);
    fcm.send("/topics/FireSmokeDetected-" + data[1], {floor : data[2], room : data[3]}, (err, data)=>{
        console.log(err, data)
    })
})

ee.on("aedes_/SmokeDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    let dataupdate = {}
    dataupdate.$set = {}
    dataupdate.$set[`${data[1]}.${data[2]}.0`] = 2
    db.collection("user").updateOne({id : data[0]}, dataupdate, (err, result)=>{
        if(err) throw err;
        io.emit("userConditionChange" + data[0]);
    })
    // io.emit("/user/SmokeDetected/" + data[0]);
    // fcm.send("/topics/SmokeDetected-" + data[0], {floor : data[1], room : data[2]})
})

ee.on("aedes_/FireDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    let dataupdate = {}
    dataupdate.$set = {}
    dataupdate.$set[`${data[1]}.${data[2]}.0`] = 1
    db.collection("user").updateOne({id : data[0]}, dataupdate, (err, result)=>{
        if(err) throw err;
        io.emit("userConditionChange" + data[0]);
    })

    // io.emit("/user/FireDetected/" + data[0]);

    // fcm.send("/topics/FireDetected-" + data[0], {floor : data[1], room : data[2]})
})

ee.on("aedes_/NoDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    let dataupdate = {}
    dataupdate.$set = {}
    dataupdate.$set[`${data[1]}.${data[2]}.0`] = 0
    db.collection("user").updateOne({id : data[0]}, dataupdate, (err, result)=>{
        if(err) throw err;
        io.emit("userConditionChange" + data[0]);
    })

    // io.emit("/user/NoDetected/" + data[0]);
    
    // fcm.send("/topics/NoDetected-" + data[0], {floor : data[1], room : data[2]})
})


io.on('connection', function (socket) {
    console.log('a user connected');
    socket.on('disconnect', function () {
        console.log('user disconnected');
    });

    socket.on("enteringApp", () => {
        socket.emit("connected")
    })

    socket.on("findPlace", (data) => {
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection(data.option).find({"name" : data.name, "token" : data.token}, {"name" : 1}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length > 0) socket.emit("userFindPlaceResult", {"status" : true, "id" : result[0].id})
            else socket.emit("findPlaceResult", {"status" : false, "id" : ""})
        })
    })

    socket.on("searchPlace",  (data) => {
        db.collection(data.option).find({"name" : {"$regex" : data.place, "$options" : "i"}}, {"name" : 1}).toArray((err, result)=>{
            if(err) throw err;
            result = result.map((item)=>{return item.name; })
            socket.emit("searchPlaceResult", {"data" : result})
        })
    })

    socket.on("userRequestStatus", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection(data.option).find({"id" : data.id, "token" : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            let data = result[0];
            let records = []
            for(let key in data){
                if(key.substring(0, 1) == "F"){
                    for(let key1 in data[key]){
                        records.push(data[key][key1][0])
                    }
                }
            }
            socket.emit("userStatusResult", records)
        })
    })
    


    socket.on("dsa", (data)=>{
        console.log("dsa");
        io.emit("asd", data)
    })
})

