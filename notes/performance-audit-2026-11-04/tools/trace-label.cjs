const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const originalLoad = Module._load;
let count = 0;
Module._load = function(request, parent, isMain) {
  const result = originalLoad.apply(this, arguments);
  if (request !== '@resvg/resvg-js') return result;
  return {...result, Resvg:new Proxy(result.Resvg, {construct(target,args) {
    try {return Reflect.construct(target,args);} catch(error) {
      const name = path.join(__dirname,`../production-label-failure-${++count}.svg`);
      fs.writeFileSync(name,args[0]);
      fs.writeFileSync(name+'.json',JSON.stringify({error:String(error),fragmentAtError:args[0].slice(540,800),options:args[1]},null,2));
      throw error;
    }
  }})};
};
