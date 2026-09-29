import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const routes={'/preview':'index.html','/':'index.html','/app.js':'app.js','/style.css':'style.css','/robots.txt':'robots.txt'};
createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;const file=routes[path];if(!file){res.writeHead(404);res.end('Not found');return;}try{const body=await readFile(new URL('../public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(body);}catch{res.writeHead(500);res.end('Error');}}).listen(8787,'127.0.0.1',()=>console.log('Preview (no notifications): http://localhost:8787/preview'));
