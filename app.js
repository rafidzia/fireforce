
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

const axios = require('axios');
const settings = require('./settings.json')

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
    let data = dataMap.split(";")             // contoh format data C1;F1;R1 (Client 1 Floor 1 Room 1)
    let dataupdate = {}
    dataupdate.$set = {}
    dataupdate.$set[`${data[1]}.${data[2]}.0`] = 3
    db.collection("user").updateOne({id : data[0]}, dataupdate, (err, result)=>{
        if(err) throw err;
        io.emit("userConditionChange" + data[0]);
    })
    ee.emit("detailChanged", {id : data[0]})
    
    fcm.send("/topics/FireSmokeDetected-" + data[0], {floor : data[1], room : data[2]}, false, (err, data)=>{
        console.log(err, data)
    })

    db.collection("user").findOne({id : data[0]}, (err, result)=>{
        if(err) throw err;
        if(!result.name) return;

        db.collection("fireman").find({demand : result.id}).toArray((err, result0)=>{
            if(err) throw err;
            if(result0.length > 0) return;
            db.collection("fireman").find({demand : "-"}).toArray(async (err, result1)=>{
                if(err) throw err;
    
                let tempData = []
                tempData.push([result.longitude, result.latitude])
                for(let i = 0; i < result1.length; i++){
                    tempData.push([result1[i].longitude, result1[i].latitude])
                }
                let distanceMatrix = await axios({method : "post", url : "https://api.openrouteservice.org/v2/matrix/driving-car", headers : {Authorization : settings.token}, data : {locations : tempData}})
    
                let timeDistanceAll = distanceMatrix.data.durations
                let minTimeDistance = 1;
                for(let i = 1; i < timeDistanceAll.length; i++){
                    if(timeDistanceAll[i][0] < timeDistanceAll[minTimeDistance][0]){
                        minTimeDistance = i;
                    }
                }
                let choosedFireman = result1[minTimeDistance - 1]
    
                db.collection("fireman").updateOne({id : choosedFireman.id}, {$set : {demand : result.id}}, (err, result2)=>{
                    if(err) throw err;
                    fcm.send("/topics/FireSmokeDetected-" + choosedFireman.id, {place : result.name}, false, (err, data)=>{
                        console.log(err, data)
                    })
                })
            })
        })
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
    ee.emit("detailChanged", data[0])

    db.collection("user").find({id : data[0]}).toArray((err, result)=>{
        if(err) throw err;
        if(result.length == 0) return;
        ee.emit("setNotif", data[0], {"title" : "Terdeteksi Asap", "body" : "Lantai "+ data[1].substring(1, data[1].length) +" Ruang '" + result[0][data[1]][data[2]][1] + "'"})
    })

    // io.emit("/user/SmokeDetected/" + data[0]);
    // fcm.send("/topics/SmokeDetected-" + data[0], false, {"title" : "Terdeteksi Asap", "body" : "Lantai " + data[1] + " Ruang " + data[2]})
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
    ee.emit("detailChanged", data[0])
    // io.emit("/user/FireDetected/" + data[0]);
    db.collection("user").find({id : data[0]}).toArray((err, result)=>{
        if(err) throw err;
        if(result.length == 0) return;
        ee.emit("setNotif", data[0], {"title" : "Terdeteksi Api", "body" : "Lantai "+ data[1].substring(1, data[1].length) +" Ruang '" + result[0][data[1]][data[2]][1] + "'"})
    })
    

    // fcm.send("/topics/FireDetected-" + data[0], false, {"title" : "Terdeteksi Api", "body" : "Lantai " + data[1] + " Ruang " + data[2]})
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
    ee.emit("detailChanged", data[0])
    
    // io.emit("/user/NoDetected/" + data[0]);
    
    // fcm.send("/topics/NoDetected-" + data[0], {floor : data[1], room : data[2]})
})


ee.on("setNotif", (client, notifData)=>{
    fcm.send("/topics/notify-" + client, false, notifData, (err, data)=>{
        console.log(err, data)
    })
})

ee.on("detailChanged", (id)=>{
    db.collection("user").find({id : id}).toArray((err, result)=>{
        if(err) throw err;
        if(result.length == 0) return;
        result = result[0];
        let records = []
        for(let key in result){
            if(key.substring(0, 1) == "F"){
                let tmpData = {}
                tmpData.name = key;
                tmpData.data = []
                for(let key1 in result[key]){
                    tmpData.data.push(result[key][key1])
                }
                records.push(tmpData)
            }
        }
        io.emit("userDetailResult-" + id, records)
    })
})

io.on('connection', function (socket) {

    // var a = 

    console.log('a user connected');
    socket.on('disconnect', function () {
        // ee.removeListener("detailChanged", a)
        console.log('user disconnected');
    });

    socket.on("enteringApp", () => {
        socket.emit("connected")
    })

    socket.on("findPlace", (data) => {
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection(data.option).find({"name" : data.name, "token" : data.token}, {"name" : 1}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length > 0) socket.emit("findPlaceResult", {"status" : true, "id" : result[0].id})
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
        db.collection("user").find({"id" : data.id, "token" : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            let records = []
            for(let key in result){
                if(key.substring(0, 1) == "F"){
                    for(let key1 in result[key]){
                        records.push(result[key][key1][0])
                    }
                }
            }
            socket.emit("userStatusResult", records)
        })
    })

    socket.on("firemanRequestStatus", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("fireman").find({"id" : data.id, "token" : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            if(result.demand != "-"){
                socket.emit("firemanStatusResult", {"status" : true, "demand" : result.demand})
            }else{
                socket.emit("firemanStatusResult", {"status" : false, "demand" : result.demand})
            }
        })
    })
    
    socket.on("userRequestDetail", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("user").find({id : data.id, token : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            let records = []
            for(let key in result){
                if(key.substring(0, 1) == "F"){
                    let tmpData = {}
                    tmpData.name = key;
                    tmpData.data = []
                    for(let key1 in result[key]){
                        tmpData.data.push(result[key][key1])
                    }
                    records.push(tmpData)
                }
            }
            socket.emit("userDetailResult-" + data.id, records)
        })
    })

    // ee.on("detailChanged", (data)=>{
    //     let checkData = {}
    //     checkData.id = data.id;
    //     if(data.token) checkData.token = data.token;
        
    // });

    socket.on("userSearchByFloorRoom", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("user").find({"id" : data.id, "token" : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            let records = {};
            for(let key in result){
                if(key == data.floor){
                    records.floor = key.substring(1, key.length);   
                    for(let key1 in result[key]){
                        if(key1 == data.room){
                            records.room = result[key][key1][1];
                        }
                    }
                }
            }
            
            socket.emit("userSearchByFloorRoomResult", records)
        })
    })

    socket.on("userRequestFireman", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("user").find({"id" : data.id, "token" : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            db.collection("fireman").find({demand : result.id}).toArray((err, result1)=>{
                if(err) throw err;
                if(result1.length == 0){
                    socket.emit("userFiremanDone")
                    return;
                }
                result1 = result1[0];
                socket.emit("userResultFireman", {name : result1.name})
            })
        })
    })

    socket.on("firemanRequestClient", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("fireman").find({id : data.id, token : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            db.collection("user").find({"id" : result.demand}).toArray((err, result1)=>{
                if(err) throw err;
                if(result1.length == 0) return;
                result1 = result1[0];
                socket.emit("firemanResultClient", {"name" : result1.name, "address" : result1.address})
            })
        })
    })

    socket.on("firemanStreamLocation", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("fireman").find({id : data.id, token : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            db.collection("user").find({"id" : result.demand}).toArray(async (err, result1)=>{
                if(err) throw err;
                if(result1.length == 0) return;
                result1 = result1[0];
                let directionsGeoJSON = await axios({method : "post", url : "https://api.openrouteservice.org/v2/directions/driving-car/geojson", headers : {Authorization : settings.token}, data : {coordinates  : [[data.longitude, data.latitude],[result1.longitude, result1.latitude]]}})
                let duration = directionsGeoJSON.data.features[0].properties.summary.duration;
                let distance = directionsGeoJSON.data.features[0].properties.summary.distance;
                let coordinates = directionsGeoJSON.data.features[0].geometry.coordinates;
                
                io.emit("firemanStreamLocationResult-" + result1.id, {duration : duration, distance : distance, coordinates : coordinates})
                socket.emit("firemanStreamLocationResult", {duration : duration, distance : distance, coordinates : coordinates})
            
            })
        })
    })

    socket.on("firemanFireExtinguished", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("fireman").updateOne({id : data.id, token : data.token}, {$set : {demand : "-"}}, (err, result1)=>{
            if(err) throw err;
            socket.emit("firemanFireExtinguishedResult")
        })
    })

    socket.on("userFireExtinguished", (data)=>{
        data.token = crypto.createHash('sha256').update(data.token).digest('hex');
        db.collection("user").find({"id" : data.id, "token" : data.token}).toArray((err, result)=>{
            if(err) throw err;
            if(result.length == 0) return;
            result = result[0];
            db.collection("fireman").updateOne({demand : result.id}, {$set : {demand : "-"}}, (err, result1)=>{
                if(err) throw err;
                socket.emit("firemanFireExtinguishedResult")
            })
        })
        
    })



    socket.on("dsa", (data)=>{
        console.log("dsa");
        io.emit("asd", data)
    })
})

