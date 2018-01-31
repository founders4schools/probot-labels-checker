const yaml = require('js-yaml');
const slugify = require('slugify');

async function loadConfig(context) {
  const content = await context.github.repos.getContent(context.repo({
      path: '.github/prs-label-checker.yml'
  }));
  return yaml.safeLoad(Buffer.from(content.data.content, 'base64').toString());
}

async function setStatusForLabel(status, labelConfig, action, context) {
  const statusMsg = labelConfig[status] ? labelConfig[status] : `Label '${labelConfig.label}' ${action}`;
  const labelSlug = slugify(labelConfig.label).toLowerCase();
  const statusContext = `label/${labelSlug}`;
  console.info("Setting status to " + status);
  await context.github.repos.createStatus(context.repo({
    sha: context.payload.pull_request.head.sha,
    state: status,
    description: statusMsg,
    context: statusContext
  }));
}

async function onLabelChanged(status, action, context) {
  const config = await loadConfig(context);
  for(const key in config) {
    const labelConfig = config[key];
    if(context.payload.label.name === labelConfig.label) {
      await setStatusForLabel(status, labelConfig, action, context);
    }
    
  }
}

async function onLabelAdded(context) {
  await onLabelChanged('success', 'present', context);
}

async function onLabelRemoved(context) {
  await onLabelChanged('pending', 'missing', context);
}

async function onPullRequestOpened(context) {
  const config = await loadConfig(context);
  for(const key in config) {
    const labelConfig = config[key];
    await setStatusForLabel('pending', labelConfig, 'missing', context);
  }
}

module.exports = (robot) => {
  // Set status pending by default
  robot.on('pull_request.opened', onPullRequestOpened);
  
  // Set status OK when 'staging' label is added
  robot.on('pull_request.labeled', onLabelAdded);
  
  // Reset status to pending when 'staging' label is removed
  robot.on('pull_request.unlabeled', onLabelRemoved);
}
