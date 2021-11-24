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

setTimeout(() => {
    publish("test", "test")
}, 1000)


app.get("/", (req, res) => {
    res.send("asd")
})

ee.on("aedes_/FireSmokeDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data Long,Lat;C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/FireSmokeDetected/" + data[1], data[2] + ";" + data[3])
})

ee.on("aedes_/SmokeDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/SmokeDetected/" + data[0], data[1] + ";" + data[2])
})

ee.on("aedes_/FireDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/FireDetected/" + data[0], data[1] + ";" + data[2])
})

ee.on("aedes_/NoDetected", (dataMap) => {
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    io.emit("/user/NoDetected/" + data[0], data[1] + ";" + data[2])
})


io.on('connection', function (socket) {
    console.log('a user connected');
})

io.on('disconnect', function () {
    console.log('user disconnected');
});