const fs=require('fs'),path=require('path'),cp=require('child_process');
fs.mkdirSync('dist/assets',{recursive:true});
const bin=process.platform==='win32'?path.resolve('node_modules/@esbuild/win32-x64/esbuild.exe'):path.resolve('node_modules/.bin/esbuild');
const result=cp.spawnSync(bin,['src/main.tsx','--bundle','--minify','--format=esm','--target=chrome130','--outfile=dist/assets/app.js'],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);
fs.writeFileSync('dist/index.html',fs.readFileSync('index.html','utf8').replace('<script type="module" src="/src/main.tsx"></script>','<link rel="stylesheet" href="./assets/app.css"/><script type="module" src="./assets/app.js"></script>'));
