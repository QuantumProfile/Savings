function compareType(a,b){
  if(a==null||a==undefined)return a==b;
  return a.constructor==b.constructor
}
class Record{
  #inner
  #toString
  constructor(object){
    if(!compareType(object,{}))throw 'Input must be of the form {...}';
    this.#inner=object
  }
  get inner(){return this.#inner}
  set(field,value){
    const output=this.#inner;
    output[field]=value;
    return new Record(output)
  }
  update(transformation){
    if(!compareType(transformation,{}))throw 'Input must be of the form {...}';
    const aux=function(value, trans){
      const newValue=value;
      for(let key in trans){
        if(!value.hasOwnProperty(key))continue;
        if(!compareType(value[key],{})){
          newValue[key]=trans[key];
        }
        newValue[key]=aux(value[key],trans[key])
      }
      return newValue
    }
    return new Record(aux(this.#inner))
  }
  get toString(){
    const replace=function(input){
      if(typeof input!='object'||input==null)return input;
      if(Array.isArray(input))return input.map(replace);
      if(!input instanceof Record&&!input instanceof Dict){
        const output=input;
        for(let key in input){
          output[key]=replace(input(key))
        }
        return output
      }
      if(input instanceof Record)return replace(input.inner);
      return replace(input.toList)
    }
    return JSON.stringify(replace(this.#inner))
  }
}
class SumType{
  constructor(...constructors){
    constructors.forEach(s=>{
      if(typeof s!='string')throw 'The constructors must be strings';
      this[s]=stored=>function(cases){
        const errmsg='Input has to be of the form {...} with the keys being the constructors and the values being functions that take the stored value and output some (perhaps other) value'
        if(!compareType(cases,{}))throw errmsg;
        let nonExistingCase=false;let problematicCase;
        for(let key in cases){
          if(constructors.includes(key))continue;
          nonExistingCase=true;
          problematicCase=key
        }
        if(nonExistingCase)throw `I was given a ${problematicCase} case in the "pattern match", but there is no such constructor`;
        let missingCase=false;
        constructors.forEach(t=>{
          if(cases.hasOwnProperty(t))return;
          missingCase=true;
          problematicCase=t
        });
        if(missingCase)throw `The "pattern match" given is missing the case ${problematicCase}`;
        if(typeof cases[s]!='function')throw errmsg;
        return cases[s](stored)
      }
    });
  }
}
function hasDictFormat(list){
  if(!Array.isArray(list))return false;
  if(list.length<2)return !Array.isArray(list[0])||list[0].length!=2;
  const [key,value]=list[0];
  for(let i=1;i<list.length;i++){
    if(list[i].length!=2)return false;
    if(!compareType(list[i][0],key))return false;
    if(!compareType(list[i][1],value))return false;
  }
  return true
}
const Maybe=new SumType('Just','Nothing');
class Dict{
  #toList
  #keys
  #values
  #size
  #isEmpty
  #toString
  constructor(...list){
    if(!hasDictFormat(list))throw 'Input must be a list of key-value pairs (lists of length 2) with only one key type and only one value type';
    this.#keys=list.map(e=>e[0]);
    this.#values=list.map(e=>e[1]);
    this.#toList=list;
    this.#size=list.length;
    this.#isEmpty=list.length<1;
    if(list.length<2)return;
    if(this.#keys.reduce(([value,previous],current)=>[value||previous!=current,current],[false,this.#keys[0]]))throw 'There must not be repeated keys'
  }
  get toList(){return this.#toList}
  get keys(){return this.#keys}
  get values(){return this.#values}
  get size(){return this.#size}
  get isEmpty(){return this.#isEmpty}
  member(key){return this.#keys.includes(key)}
  insert(key,value){return new Dict([[key,value],...this.#toList.filter(e=>e[0]!=key)])}
  remove(key){return new Dict(this.#toList.filter(e=>e[0]!=key))}
  get(key){
    const output=this.#toList.filter(e=>e[0]==key);
    if(output.length==0)return Maybe.Nothing();
    else return Maybe.Just(output[0][1]);
  }
  update(key,transformation){
    if(typeof transformation!='function')throw 'The transformation must be a function that takes a Maybe input and returns a Maybe output';
    return transformation(this.get(key))({
      Just:value=>this.insert(key,value),
      Nothing:()=>this
    })
  }
  map(transformation){
    if(typeof transformation!='function')throw 'Input must be a function that take a key and its value, and returns a new value for the key';
    return new Dict(this.#toList.map(e=>[e[0],transformation(e[0],e[1])]))
  }
  get toString(){
    const replace=function(input){
      if(typeof input!='object'||input==null)return input;
      if(Array.isArray(input))return input.map(replace);
      if(!input instanceof Record&&!input instanceof Dict){
        const output=input;
        for(let key in input){
          output[key]=replace(input(key))
        }
        return output
      }
      if(input instanceof Record)return replace(input.inner);
      return replace(input.toList)
    }
    return JSON.stringify(replace(this.#toList))
  }
}
function read(text){
  if(typeof text!='string')throw 'Input has to be a string';
  const replace=function(input){
    if(typeof input!='object'||input==null)return input;
    if(Array.isArray(input)){
      if(hasDictFormat(input))return new Dict(...input.map(e=>[e[0],replace(e[1])]));
      return input.map(replace)
    }
    const output=input;
    for(let key in input){
      output[key]=replace(input[key])
    }
    return new Record(output)
  }
  return replace(JSON.parse(text))
}
class FObject{
  #model
  #implementation
  #outcomes=[]
  constructor(init,update,subscriptions, implementation=[function(){},function(){}]){
    if(typeof update!='function'||!Array.isArray(subscriptions))throw 'init has to be the initial state, update has to be a function that takes a message, the current model and returns a pair consisting of the new model and Maybe a command, and subscriptions has to be a list of subscriptions (made with the send method of other objects)';
    this.#model=init[0];
    this.#implementation=function(msg){
      const [newModel,mcommand]=update(msg,this.#model);
      this.#model=newModel;
      implementation[1](msg);
      this.#outcomes.forEach(f=>mcommand({
        Nothing:()=>{},
        Just:signal=>f(signal)
      }));
    };
    subscriptions.forEach(g=>g(this.#implementation));
    implementation[0]();
  }
  send(execute){
    return (callback)=>{
      this.#outcomes.push(signal=>execute(signal)({
        Nothing:()=>{},
        Just:msg=>callback(msg)
      }))
    }
  }
  connect(listen){return signal=>listen(signal)({
    Nothing:()=>{},
    Just:msg=>this.#implementation(msg)
  })}
}