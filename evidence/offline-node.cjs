// Load only for offline unit tests. No credentials or real services are needed.
const blocked=()=>{throw Error('OFFLINE_TEST: external network prohibited')};
globalThis.fetch=blocked;
for(const name of ['node:http','node:https']){
 const module=require(name);module.request=blocked;module.get=blocked;
}
const net=require('node:net');net.connect=blocked;net.createConnection=blocked;
net.Socket.prototype.connect=blocked;
const tls=require('node:tls');tls.connect=blocked;
const dns=require('node:dns');dns.lookup=blocked;dns.resolve=blocked;
require('node:module').syncBuiltinESMExports();
