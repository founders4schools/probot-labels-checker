const yaml = require('js-yaml');
const slugify = require('slugify');

function logEvent(context, msg) {
  console.log(
    `Received event from ${context.payload.repository.full_name} PR#${context.payload.pull_request.number} - ${msg}`
  );
}

async function loadConfig(context) {
  try {
    const content = await context.github.repos.getContent(context.repo({
      path: '.github/prs-label-checker.yml'
    }));
    return yaml.safeLoad(Buffer.from(content.data.content, 'base64').toString());
  } catch (err) {
    console.error(`Error while trying to get config for repository ${context.payload.repository.full_name}`);
    return {};
  }
}

async function setStatusForLabel(status, labelConfig, action, context) {
  const statusMsg = labelConfig[status] ? labelConfig[status] : `Label '${labelConfig.label}' ${action}`;
  const labelSlug = slugify(labelConfig.label).toLowerCase();
  const statusContext = `label/${labelSlug}`;
  logEvent(context, `Setting status to ${statusMsg}`);
  await context.github.repos.createStatus(context.repo({
    sha: context.payload.pull_request.head.sha,
    state: status,
    description: statusMsg,
    context: statusContext
  }));
}

async function onLabelChanged(status, action, context) {
  const config = await loadConfig(context);
  Object.keys(config)
    .filter(k => config[k].label === context.payload.label.name)
    .map(k => setStatusForLabel(status, config[k], action, context));
}

async function onLabelAdded(context) {
  logEvent(context, `Label added: ${context.payload.label.name}`);
  await onLabelChanged('success', 'present', context);
}

async function onLabelRemoved(context) {
  logEvent(context, `Label removed: ${context.payload.label.name}`);
  await onLabelChanged('pending', 'missing', context);
}

async function onPullRequestOpened(context) {
  logEvent(context, 'Pull request opened');
  const config = await loadConfig(context);
  Object.keys(config).map(key => setStatusForLabel('pending', config[key], 'missing', context));
}

module.exports = robot => {
  console.log('App ready');

  // Set status pending by default
  robot.on('pull_request.opened', onPullRequestOpened);

  // Set status OK when 'staging' label is added
  robot.on('pull_request.labeled', onLabelAdded);

  // Reset status to pending when 'staging' label is removed
  robot.on('pull_request.unlabeled', onLabelRemoved);
};
