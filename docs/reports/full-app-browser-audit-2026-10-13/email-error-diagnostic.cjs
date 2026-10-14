const q=require('./qa.cjs');const text=q.fs.readFileSync(q.path.join(q.privateDir,'server.log'),'utf8');const lines=text.split(/\r?\n/);console.log(q.scrub(lines.slice(-24).join('\n')));
