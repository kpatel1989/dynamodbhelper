'use strict';
var AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });
let count = 0;
function RecursiveGet(tableName,items,start,condition,callback)
{
    //condition = {operator:and,conditions:["a>:para1","b<:para2","c!=:para3"],parameters:{":para1":0,":para2":0,":para3":0}}
    let paras = {
        TableName: tableName,
        Limit: 100
    };
    if(condition)
    {
        let {conditions,operator,parameters} = condition;
        let filter = conditions.join(` ${operator} `);
        paras.FilterExpression = filter;
        paras.ExpressionAttributeValues = parameters;
    }
    if(start)
        paras.ExclusiveStartKey = start;

    //console.log(paras);
    count+=1;
    setTimeout(function() {
        docClient.scan(paras, function (err, data) {
            count-=1;
            if (err) {
                //console.log(`Fail fetching data from ${tableName}`, err);
                callback("Error");
            } else {
                //console.log(data);
                items.push(...data.Items);
                if(data.LastEvaluatedKey)
                    RecursiveGet(tableName,items,data.LastEvaluatedKey,condition,callback);
                else
                    callback("Done");
            }
        });
    }, 250*count);


}

function write(items,tableName,requestType)
{
    let paras = {};
    let tableparas = {};
    let itemsparas = items.map((Item)=>
    {
        let itemrequest = {};
        if(requestType=="PutRequest")
            itemrequest[requestType] = {Item};
        else
            itemrequest[requestType] = {Key:Item};
        return itemrequest;
    });
    tableparas[tableName] = itemsparas;    
    paras.RequestItems=tableparas;
    //console.log(items);
    count+=1;
    return new Promise((resolve,reject)=>{
        setTimeout(function() {
            docClient.batchWrite(paras, function (err) {
                count-=1;
                let writeType = requestType=="PutRequest"?"Insert":"Delete";
                if (err) {
                    reject(`Fail to ${writeType} records to table ${tableName}: Error: ${err}`);
                } else {
                    resolve(`${writeType} Records successfully in table ${tableName}`);
                }
            });
        }, 250*count);
        
    });

}

function recursiveWrite(items,tableName,requestType,callback)
{
    if(items.length<=0)
        callback("Done");
    else
    {
        if(items.length<=25)
        {
            write(items,tableName,requestType)
                .then(success=>{
                    //console.log(success);
                    callback("Done");
                })
                .catch(error=>{
                    //console.log(error);
                    callback(error);
                });
            
        }
        else
        {
            let subItems = items.slice(0,25);            
            write(subItems,tableName,requestType)
                .then(success=>{
                    //console.log(success);
                    recursiveWrite(items.slice(25),tableName,requestType,callback);
                })
                .catch(error=>{
                    //console.log(error);
                    callback(error);
                });
        }
    }
}

//create/update only one item
function InsertItem(item, tableName, callback)
{
    const params = {
        Item: item,
        TableName: tableName,
    };
    docClient.put(params, function (err) {
        if (err) {
            ////console.log(`Fail inserting record to table ${tableName}: `, err);
            callback(err);
        } else {
            ////console.log(`Record inserted successfully to table ${tableName}`);
            callback(null, `Record inserted successfully to table ${tableName}`);
        }
    });
}

//create/update multiple items
function InsertItems(items, tableName,callback)
{
    recursiveWrite(items,tableName,"PutRequest",(msg)=> callback(msg));
}

//delete items
function DeleteItems(items, tableName,callback)
{
    recursiveWrite(items,tableName,"DeleteRequest",(msg)=> callback(msg));
}

//read item by key
function GetItemById(item, tableName) 
{
    var params = {
        Key: item,
        TableName: tableName,
    };
    return new Promise((resolve,reject)=>{
        docClient.get(params, function (err, data) {
            if (err) {
                reject(`Fail fetching data from ${tableName},Error: ${err}`);
            } else {
                resolve(data.Item);
            }
        });
    });

}

//read all items, conditions is optional and must be well formated
function GetAllItems(tableName,condition=null)
{
    let items = [];
    return new Promise((resolve,reject)=>{
        RecursiveGet(tableName,items,null,condition,(msg)=>{
            if(msg=="Error")
                reject(`Fail fetching data from ${tableName}`);
            else
                resolve(items);
        });
    });

}

//update one item
function UpdateItem(key,attr,tableName)
{
    let expression = [];
    let expressionNames = {};
    let expressionValues = {};
    Object.keys(attr).forEach((key,index)=>{
        expressionNames[`#para${index}`] = key;
        expressionValues[`:val${index}`] = attr[key];
        expression.push(`#para${index} = :val${index}`);
    });
    const params = {
        Key: key,
        TableName: tableName,
        ExpressionAttributeNames:expressionNames,
        ExpressionAttributeValues:expressionValues,
        UpdateExpression:`SET ${expression}`
    };
    return new Promise((resolve,reject)=>{
        docClient.update(params, function (err, data) {
            if (err) {
                reject(`Fail updating data from ${tableName},Error: ${err}`);
            } else {
                //console.log(data);
                resolve(data.Item);
            }
        });
    });
}

module.exports = {
    InsertItem,
    InsertItems,
    DeleteItems,
    GetItemById,
    GetAllItems,
    UpdateItem
};