'use strict';
var _ = require('lodash');
var mongoose = require('mongoose');

var allowedTypes = ['integer', 'long', 'float', 'double', 'string', 'password', 'boolean', 'date', 'dateTime', 'array', 'object'];
var definitions = null;

var propertyMap = function (property) {
  if (property == undefined) return String;

  switch (property.type) {
    case 'integer':
    case 'long' :
    case 'float' :
    case 'double' :
      return Number;
    case 'string':
    case 'password':
      return String;
    case 'boolean':
      return Boolean;
    case 'date':
    case 'dateTime':
      return Date;
    case 'object':
    case 'array':
      return [propertyMap(property.items)];
    default:
      throw new Error('Unrecognized schema type: ' + property.type);
  }
};

var convertToJSON = function(spec){
  var swaggerJSON = {};
  var type = typeof(spec);
  switch (type) {
    case 'object':
      if (spec instanceof Buffer){
        swaggerJSON = JSON.parse(spec);
      } else {
        swaggerJSON = spec;
      }
      break;
    case 'string':
      swaggerJSON = JSON.parse(spec);
      break;
    default:
      throw new Error('Unknown or invalid spec object');
      break;
  }
  return swaggerJSON;
};

var isSimpleSchema = function(schema) {
  return schema.type && isAllowedType(schema.type);
};

var isAllowedType = function(type) {
  return allowedTypes.indexOf(type) != -1;
};

var isPropertyHasRef = function(property) {
  return property['$ref'] || ((property['type'] == 'array') && (property['items']['$ref']));
}

var getSchema = function(object) {
  var props = {};
  _.forEach(object, function (property, key) {
    if (property == undefined || !property) return;

    if (isPropertyHasRef(property)) {
      var refRegExp = /^#\/definitions\/(\w*)$/;
      var refString = property['$ref'] ? property['$ref'] : property['items']['$ref'];
      var propType = refString.match(refRegExp)[1];
      props[key] = [getSchema(definitions[propType]['properties'] ? definitions[propType]['properties'] : definitions[propType])];
    }
    else if (property.type) {
      var type = propertyMap(property);
      props[key] = {type: type};
    }
    else if (isSimpleSchema(object)) {
      props = {type: propertyMap(object)};
    } else {
      props = {type: propertyMap(object)};
    }
  });

  return props;
};

module.exports.compileAsync = function (spec, callback) {
  try {
    callback(null, this.compile(spec));
  } catch (err) {
    callback({message: err}, null);
  }
};

module.exports.compile = function (spec) {
  if (!spec) throw new Error('Swagger spec not supplied');

  var swaggerJSON = convertToJSON(spec);
  definitions = swaggerJSON['definitions'];
  var schemas = {};
  _.forEach(definitions, function (definition, key) {
    if (key.match(/.*Response$/)) return;
    console.log("Working on "+key);

    var object = [getSchema(definition['properties'] ? definition['properties'] : definition)];
    schemas[key] = new mongoose.Schema(object);
  });

  var models = {};
  _.forEach(schemas, function (schema, key) {
    models[key] = mongoose.model(key, schema);
  });

  return {
    schemas: schemas,
    models: models
  };
};
