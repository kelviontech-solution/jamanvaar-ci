const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// Read configuration names/public runner metadata only. Never request secret values.
const inspect = args => {
  try {
    return { status: 'read', data: JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) };
  } catch (error) {
    return { status: 'unavailable', exitCode: error.status, reason: 'API metadata not accessible; absence cannot be inferred' };
  }
};
const repos = ['om7867/kiosk', 'kelviontech-solution/jamanvaar-ci'].map(repository => {
  const environments = inspect(['api', `repos/${repository}/environments`]);
  const environmentNames = environments.status === 'read' ? environments.data.environments.map(x => x.name) : [];
  const runners = inspect(['api', `repos/${repository}/actions/runners`]);
  return {
    repository,
    secretNames: inspect(['secret', 'list', '--repo', repository, '--json', 'name']),
    variableNames: inspect(['variable', 'list', '--repo', repository, '--json', 'name']),
    environments: { status: environments.status, names: environmentNames },
    environmentConfiguration: environmentNames.map(name => ({
      name,
      secretNames: inspect(['secret', 'list', '--repo', repository, '--env', name, '--json', 'name']),
      variableNames: inspect(['variable', 'list', '--repo', repository, '--env', name, '--json', 'name'])
    })),
    runners: runners.status === 'read' ? { status: 'read', registered: runners.data.runners.map(x => ({ name: x.name, status: x.status, labels: x.labels.map(label => label.name) })) } : runners
  };
});
fs.writeFileSync(`${__dirname}/evidence/CI_SIGNING_CONFIGURATION.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Read-only repository/environment configuration names and public runner metadata; no secret contents read, no CI run triggered, no configuration changed. Organization-level secrets/runner groups and external key stores are not ruled out.', repos }, null, 2));
console.log('Recorded read-only CI signing metadata. Secret contents were not requested.');
