const assert = require('node:assert/strict');
const evaluatePromptCondition = require('../lib/promptCondition');

describe('evaluatePromptCondition', () => {
  const answers = {
    includeTenantAdmin: true,
    includeTenantClient: false,
    portal: {
      type: 'tenant'
    }
  };

  it('应支持 undefined / 字段真值 / equals / notEquals / includes / all / any', () => {
    assert.equal(evaluatePromptCondition(undefined, answers), true);
    assert.equal(evaluatePromptCondition('includeTenantAdmin', answers), true);
    assert.equal(evaluatePromptCondition('includeTenantClient', answers), false);
    assert.equal(evaluatePromptCondition({ name: 'includeTenantAdmin', equals: true }, answers), true);
    assert.equal(evaluatePromptCondition({ name: 'includeTenantClient', notEquals: true }, answers), true);
    assert.equal(evaluatePromptCondition({ path: 'portal.type', includes: ['tenant', 'client'] }, answers), true);
    assert.equal(
      evaluatePromptCondition(
        {
          all: ['includeTenantAdmin', { name: 'portal.type', equals: 'tenant' }]
        },
        answers
      ),
      true
    );
    assert.equal(
      evaluatePromptCondition(
        {
          any: ['includeTenantClient', { name: 'portal.type', equals: 'client' }]
        },
        answers
      ),
      false
    );
  });
});
