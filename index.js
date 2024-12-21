const express = require('express')
const cors = require('cors')
const jwt =require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()

const port = process.env.PORT || 9000
const app = express()
app.use(cookieParser())

const corOptions={
  origin:['http://localhost:5173'],
  credentials:true,
  optionalSuccessStatus:200
}
app.use(cors(corOptions))
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gamza.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@main.yolij.mongodb.net/?retryWrites=true&w=majority&appName=Main`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
// token verify
const verifyToken=(req,res,next)=>{
const token=req.cookies?.token
if(!token)return res.status(401).send({message:'unauthorized access'})
  jwt.verify(token,process.env.SEC_KEY,(err,decoded)=>{
if(err){
  return res.status(401).send({message:'unauthorized access'})
}
req.user=decoded
  })
  next()
}


async function run() {
  try {
//create collection
const db= client.db('solo-db')
const jobCollection = db.collection('jobs')
const bidsCollection = db.collection('bids')

//generate jwt
app.post('/jwt',async(req,res)=>{
  const email=req.body
  //create token
  const token=jwt.sign(email,process.env.SEC_KEY,{expiresIn:'365d'})
  console.log(token)
  res.cookie('token',token,{
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  }).send({success:true})
})
// clear cookie from browser
app.get('/clear-cookie',async(req,res)=>{
  res.clearCookie('token',{
    maxAge:0,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  })
  .send({success:true})
})

// job  post
app.post('/add-job',async(req,res)=>{
  const jobData = req.body
 const result =await jobCollection.insertOne(jobData)
  res.send(result)
})
// jobs item get
app.get('/jobs',async(req,res)=>{
  const result = await jobCollection.find().toArray()
  res.send(result)
})
// get jobs specific id by email
app.get('/jobs/:email',verifyToken,async(req,res)=>{
  const email = req.params.email
  const decodedEmail=req.user?.email
  // console.log('email from token--->',decodedEmail)
  // console.log('email from params--->',email)
  if(decodedEmail !==email){
    return res.status(401).send({message:'unauthorized access'})
  }
  const filter = {'buyer.email':email}
  const result = await jobCollection.find(filter).toArray()
  res.send(result)
})
// delete specific job id
app.delete('/job/:id',verifyToken,async(req,res)=>{
  const id =req.params.id
  const query = {_id:new ObjectId(id)}
  const result = await jobCollection.deleteOne(query)
  res.send(result)
})
// get a single job data from db
app.get('/job/:id',async(req,res)=>{
  const id =req.params.id
  const query = {_id:new ObjectId(id)}
  const result = await jobCollection.findOne(query)
  res.send(result)
})
//update job 
// job post
app.put('/update-job/:id',async(req,res)=>{
  const id =req.params.id
  const query = {_id:new ObjectId(id)}
  const jobData = req.body
  const updated={
    $set:jobData,
  }
  const options = {upsert:true}
 const result =await jobCollection.updateOne(query,updated,options)
  res.send(result)
})
// save a bid data in db
app.post('/add-bid',async(req,res)=>{
  const bidData = req.body
  //0 if a user placed a bid already job
const query = {email:bidData.email,jobId:bidData.jobId}
const alreadyExist  = await bidsCollection.findOne(query)
if(alreadyExist)return res.status(400).send('you have already bid on this job')
 
  //1 save data in bids collection

 const result =await bidsCollection.insertOne(bidData)
 // 2 increase bid count in jobs collection
 const filter = {_id:new ObjectId(bidData.jobId)}
 const update = {
  $inc:{bid_count:1}
 }
 const updatedBidCount =await jobCollection.updateOne(filter,update)
  res.send(result)
})
// get all bids for specific user and get all bid request  for specific user
app.get('/bids/:email', verifyToken,async(req,res)=>{
 
  const isBuyer = req.query.buyer
  const email = req.params.email
  const decodedEmail=req.user?.email
  // console.log('email from token--->',decodedEmail)
  // console.log('email from params--->',email)
  if(decodedEmail !==email){
    return res.status(401).send({message:'unauthorized access'})
  }
  let query ={}
if(isBuyer){
 query.buyer=email
}else{
 query.email =email
}
// const email = req.params.email
// const query = {email}
const result = await bidsCollection.find(query).toArray()
res.send(result)
})

// // get all bid request  for specific user
// app.get('/bid-request/:email',async(req,res)=>{
// const email = req.params.email
// const query = {buyer:email}
// const result = await bidsCollection.find(query).toArray()
// res.send(result)
// })

// updated bid status
app.patch('/bid-status-update/:id',async(req,res)=>{
  const id = req.params.id
  const {status}=  req.body
  const filter = {_id:new ObjectId(id)}
  const updated={
    $set:{status}
  }
  const result= await bidsCollection.updateOne(filter,updated)
  res.send(result)
})

// get all jobs
app.get('/all-jobs',async(req,res)=>{
  const filter=req.query.filter
  const search=req.query.search
  const sort=req.query.sort
  let options={}
  if(sort) options={sort:{deadline:sort==='asc'? 1 : -1}}
  let query={title:{
    $regex:search,$options:'i'
  }}
  if(filter)query.category=filter
  const result=await jobCollection.find(query,options).toArray()
  res.send(result)
})

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
