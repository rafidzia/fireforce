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

ee.on("aedes_/FireSmokeDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data Long,Lat;C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/FireSmokeDetected/" + data[1], data[2] + ";" + data[3])
    fcm.send("/topics/FireSmokeDetected-" + data[1], {floor : data[2], room : data[3]}, (err, data)=>{
        console.log(err, data)
    })
})

ee.on("aedes_/SmokeDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/SmokeDetected/" + data[0], data[1] + ";" + data[2])
    // fcm.send("/topics/SmokeDetected-" + data[0], {floor : data[1], room : data[2]})
})

ee.on("aedes_/FireDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/FireDetected/" + data[0], data[1] + ";" + data[2])
    // fcm.send("/topics/FireDetected-" + data[0], {floor : data[1], room : data[2]})
})

ee.on("aedes_/NoDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/NoDetected/" + data[0], data[1] + ";" + data[2])
    // fcm.send("/topics/NoDetected-" + data[0], {floor : data[1], room : data[2]})
})


io.on('connection', function (socket) {
    console.log('a user connected');
    socket.emit("connected");
    socket.on('disconnect', function () {
        console.log('user disconnected');
    });

    socket.on("enteringApp", () => {
        socket.emit("connected")
    })

    socket.on("userFindPlace", (data) => {
        
    })

    socket.on("userSearchPlace", (data) => {

        socket.emit("userSearchPlaceResult", {data : ["place1", "place2", "place3", "place4", "place5"]})
    })


    socket.on("dsa", (data)=>{
        console.log("dsa");
        io.emit("asd", data)
    })
})

