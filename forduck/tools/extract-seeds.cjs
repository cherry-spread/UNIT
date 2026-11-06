// Parse constants only; never execute downloaded application code.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'snapshot/assets/index-CH74Cr12.js'), 'utf8');
const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
const declarations = new Map();
for (const statement of ast.body) if (statement.type === 'VariableDeclaration') {
  for (const d of statement.declarations) if (d.id.type === 'Identifier') declarations.set(d.id.name, d.init);
}
const capturedAt = new Date().toISOString();
const cache = new Map([['hy', Date.parse(capturedAt)]]);
function evaluate(n) {
  if (!n) throw Error('Missing expression');
  switch (n.type) {
    case 'Literal': return n.value;
    case 'Identifier': {
      if (cache.has(n.name)) return cache.get(n.name);
      const result = evaluate(declarations.get(n.name)); cache.set(n.name, result); return result;
    }
    case 'ArrayExpression': return n.elements.flatMap(e => e.type === 'SpreadElement' ? evaluate(e.argument) : [evaluate(e)]);
    case 'ObjectExpression': return Object.fromEntries(n.properties.flatMap(p => {
      if (p.type === 'SpreadElement') return Object.entries(evaluate(p.argument));
      if (p.computed || p.method) throw Error('Unsupported object');
      return [[p.key.name ?? p.key.value, evaluate(p.value)]];
    }));
    case 'UnaryExpression': {
      const v=evaluate(n.argument);
      if(n.operator==='!') return !v;
      if(n.operator==='-') return -v;
      if(n.operator==='+') return +v;
      throw Error('Unsupported unary');
    }
    case 'BinaryExpression': {
      const l=evaluate(n.left),r=evaluate(n.right);
      if(n.operator==='+')return l+r;
      if(n.operator==='-')return l-r;
      if(n.operator==='*')return l*r;
      if(n.operator==='/')return l/r;
      throw Error('Unsupported binary');
    }
    case 'MemberExpression': return evaluate(n.object)[n.computed ? evaluate(n.property) : n.property.name];
    case 'CallExpression':
      if(n.callee.type==='MemberExpression' && n.callee.property.name==='map') {
        const values=evaluate(n.callee.object), fn=n.arguments[0];
        if(fn.type!=='ArrowFunctionExpression' || fn.params.length!==1 || fn.params[0].type!=='ArrayPattern') throw Error('Unsupported map');
        const names=fn.params[0].elements.map(p=>p.name);
        return values.map(row=>{
          const previous=names.map(name=>[name,cache.has(name),cache.get(name)]);
          names.forEach((name,i)=>cache.set(name,row[i]));
          try{return evaluate(fn.body);}finally{previous.forEach(([name,exists,value])=>exists?cache.set(name,value):cache.delete(name));}
        });
      }
      if(n.callee.type==='Identifier' && n.callee.name==='B' && n.arguments.length===1)
        return new Date(Date.parse(capturedAt)-evaluate(n.arguments[0])).toISOString();
      throw Error('Unsupported call');
    default: throw Error('Unsupported node '+n.type);
  }
}
const datasets = {};
const errors = {};
for(const match of source.matchAll(/G\(z\.(\w+),([\w$]+)\)/g)) {
  try {datasets[match[1]]=evaluate({type:'Identifier',name:match[2]});}
  catch(e){errors[match[1]]=e.message;}
}
fs.mkdirSync(path.join(root,'data'), {recursive:true});
for (const [key,value] of Object.entries(datasets)) fs.writeFileSync(path.join(root,'data',key+'.json'),JSON.stringify(value,null,2)+'\n');
fs.writeFileSync(path.join(root,'data','extraction.json'),JSON.stringify({capturedAt,note:'Default demo seeds from deployed bundle. Relative timestamps anchored to extraction time; excludes existing browser localStorage.',counts:Object.fromEntries(Object.entries(datasets).map(([k,v])=>[k,Array.isArray(v)?v.length:1])),errors},null,2)+'\n');
console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(datasets).map(([k,v])=>[k,Array.isArray(v)?v.length:1])),errors}));
