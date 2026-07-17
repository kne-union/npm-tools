const get = require('lodash/get');

const evaluatePromptCondition = (when, answers) => {
  if (when === undefined) {
    return true;
  }

  if (typeof when === 'boolean') {
    return when;
  }

  if (typeof when === 'string') {
    return Boolean(get(answers, when));
  }

  if (!when || typeof when !== 'object' || Array.isArray(when)) {
    return false;
  }

  if (Array.isArray(when.all)) {
    return when.all.every(item => evaluatePromptCondition(item, answers));
  }

  if (Array.isArray(when.any)) {
    return when.any.some(item => evaluatePromptCondition(item, answers));
  }

  const name = when.name || when.path;
  if (!name) {
    return false;
  }

  const actualValue = get(answers, name);

  if (Object.prototype.hasOwnProperty.call(when, 'equals')) {
    return actualValue === when.equals;
  }

  if (Object.prototype.hasOwnProperty.call(when, 'notEquals')) {
    return actualValue !== when.notEquals;
  }

  if (Array.isArray(when.includes)) {
    return when.includes.includes(actualValue);
  }

  return Boolean(actualValue);
};

module.exports = evaluatePromptCondition;
