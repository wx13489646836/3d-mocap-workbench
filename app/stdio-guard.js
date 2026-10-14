const fs=require('fs'),path=require('path');
const guarded=new WeakSet();
// Desktop shortcuts/background launches may outlive their parent's output pipe.
// Handle stream failures locally; don't turn failed logging into an app crash.
module.exports=(streams=[process.stdout,process.stderr])=>{
  const logFile=path.join(__dirname,'../user-data/main-errors.log');
  for(const stream of streams){
    if(!stream||guarded.has(stream))continue;guarded.add(stream);
    stream.on('error',error=>{
      if(['EPIPE','ERR_STREAM_DESTROYED'].includes(error.code))return;
      try{fs.mkdirSync(path.dirname(logFile),{recursive:true});fs.appendFileSync(logFile,new Date().toISOString()+' stdio '+(error.stack||error)+'\n');}catch{}
    });
  }
};
