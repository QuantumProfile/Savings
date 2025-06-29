function compareType(a,b){
  if(a==null||a==undefined)return a==b;
  return a.constructor==b.constructor
}
class Record{
  constructor(object){
    if(!compareType(object,{}))throw 'Input must be of the form {...}';
    this.value=object
  }
  set(field,value){
    const output=this.value;
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
    return new Record(aux(this.value))
  }
  get toString(){
    const replace=function(input){
      if(typeof input!='object'||input==null)return input;
      if(Array.isArray(input))return input.map(replace);
      if(!(input instanceof Record||input instanceof Dict)){
        const output=input;
        for(let key in input){
          output[key]=replace(input[key])
        }
        return output
      }
      if(input instanceof Record)return replace(input.value);
      return replace(input.toList)
    }
    return JSON.stringify(replace(this.value))
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
  if(list.length==0)return true;
  if(list.length==1)return Array.isArray(list[0])&&list[0].length==2;
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
  constructor(...list){
    if(!hasDictFormat(list))throw 'Input must be a list of key-value pairs (lists of length 2) with only one key type and only one value type';
    this.keys=list.map(e=>e[0]);
    this.values=list.map(e=>e[1]);
    this.toList=list;
    this.size=list.length;
    this.isEmpty=list.length<1;
    if(list.length<2)return;
    if(this.keys.reduce(([value,previous],current)=>[value||previous!=current,current],[false,this.keys[0]]))throw 'There must not be repeated keys'
  }
  member(key){return this.keys.includes(key)}
  insert(key,value){return new Dict([key,value],...this.toList.filter(e=>e[0]!=key))}
  remove(key){return new Dict(...this.toList.filter(e=>e[0]!=key))}
  get(key){
    const output=this.toList.filter(e=>e[0]==key);
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
    return new Dict(...this.toList.map(e=>[e[0],transformation(e[0],e[1])]))
  }
  filter(predicate){
    if(typeof predicate!='function')throw 'The predicate must be a function that takes a key and a value, and returns a boolean';
    return new Dict(...this.toList.filter(([key,value])=>predicate(key,value)))
  }
  get toString(){
    const replace=function(input){
      if(typeof input!='object'||input==null)return input;
      if(Array.isArray(input))return input.map(replace);
      if(!(input instanceof Record||input instanceof Dict)){
        const output=input;
        for(let key in input){
          output[key]=replace(input[key])
        }
        return output
      }
      if(input instanceof Record)return replace(input.value);
      return replace(input.toList)
    }
    return JSON.stringify(replace(this.value))
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

function run(parameters, initial, update) {
  if (typeof update != 'function') throw `Given ${update} as the update argument, but it is not a function. It has to be a function that takes the parameters and the current state, and returns a list [newState, message] with the updated State and the message to return`;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Hoja de qp');
  let currentState = sheet.getRange(1, 2).getValue();
  if (currentState == '')currentState = initial;
  else currentState = read(currentState);
  [newState, message] = update(parameters, currentState);
  sheet.getRange(1, 2).setValue(newState.toString);
  return ContentService.createTextOutput(message);
}
function doGet(e) {
  const singleton = function (key, value) {
    const r = {};
    r[key] = value;
    return r
  }
  const format = function (n) {
    if (isNaN(n)) return "0 penes";
    else if (n >= 0) return `${n} pene${n == 1 ? "" : "s"}`;
    else return `${-n} coño${n == -1 ? "" : "s"}`
  }
  return run(
    e.parameter,
    new Record({
      players:new Dict(),
      shop:new Record({
        lastStockRefill:1753660800000,
        items:new Record({
          condones:new Record({
            maxStock:3,
            stock:3,
            price:2000
          })
        })
      })
    }),
    (params,currentState)=>{
      const action=params.action,id=params.userid, user=params.user, args=params.query==''?[]:params.query.split(' ');
      if(action=='jugar'){
        const ganancias = [30, 20, 5];
        const perdidas = [-20, -10, -5];
        const opciones = ganancias.concat(perdidas);
        const cambio = opciones[Math.floor(Math.random() * opciones.length)];
        const newPlayers=currentState.value.players.get(id)({
          Nothing:()=>currentState.value.players.insert(id,new Record({
            name:user,
            points:cambio,
            inventory:new Record({
              condones:0
            })
          })),
          Just:player=>currentState.value.players.insert(id,new Record({
            name:user,
            points:player.value.points+cambio,
            inventory:player.value.inventory
          }))
        });
        return newPlayers.get(id)({
          Nothing:()=>[currentState,'Algo salió terriblemente mal :/'],
          Just:player=>[currentState.set('players',newPlayers), cambio > 0
            ? `${player.value.name} ganó ${format(cambio)} BoyKisserSwoon ! Ahora tienes ${format(player.value.points)}`
            : `${player.value.name} perdió ${format(-cambio)} BoykisserSad ! Ahora tienes ${format(player.value.points)}`
          ]
        })
      }
      if(action=='points'){
        let who;
        if(args.length==0)who=user;
        else who=args[0];
        const player=currentState.value.players.filter((k,v)=>v.value.name.toLowerCase()==who.toLowerCase());
        if(player.isEmpty)return [currentState,`Error: ${who} no existe o se ha cambiado el nombre. Tiene que usar !jugar para actualizar`];
        return [currentState,`${who} tiene ${format(player.values[0].value.points)}`]
      }
    }
  )
}
