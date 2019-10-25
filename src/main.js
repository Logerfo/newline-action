const path = require("path");
const fs = require("fs").promises;
const yaml = require("js-yaml");
const util = require("util");
const glob = util.promisify(require("glob"));
const { isText } = require('istextorbinary')
const core = require("@actions/core");
const github = require("@actions/github");

const REPO_DIRECTORY = process.env["GITHUB_WORKSPACE"],
    CONFIG_PATH = path.join(REPO_DIRECTORY, getInput("config-path", ".github/newline.yml")),
    token = core.getInput("github-token", { required: true }),
    context = github.context,
    owner = context.repo.owner,
    repo = context.repo.repo,
    client = new github.GitHub(token),
    committer = {
        name: 'Bruno Logerfo',
        email: 'bruno@logerfo.tk',
    };

const getEvent = async () => JSON.parse(await fs.readFile(process.env["GITHUB_EVENT_PATH"]));

async function getYamlConfig() {
    try {
        const text = await fs.readFile(CONFIG_PATH);
        return yaml.safeLoad(text);
    }
    catch (err) {
        core.debug(err);
        return undefined;
    }
}

async function getConfig() {
    const defaultConfig = {
        autoCommit: true,
        ignorePaths: [
            "bin/**",
            "node_modules/**",
            "out/**",
        ],
    },
        ymlConfig = await getYamlConfig(),
        config = ymlConfig ? Object.assign(defaultConfig, ymlConfig) : defaultConfig;

    core.info(ymlConfig ? "Config file loaded." : "Config file not found. Using default...");
    core.debug(JSON.stringify(config));
    return config;
}

function getInput(name, fallback) {
    const input = core.getInput(name);
    return input || fallback;
}

async function run() {
    try {
        core.debug(JSON.stringify(context.payload));
        if (github.context.eventName != "pull_request") {
            core.info("This action is supposed to run for pushes to pull requests only. Skipping...");
            return;
        }
        const event = await getEvent();
        if (!["synchronize", "opened"].includes(event.action)) {
            core.info("This action is supposed to run for pushes to pull requests only. Skipping...");
            return;
        }
        await push();
    }
    catch (err) {
        //Even if it's a valid situation, we want to fail the action in order to be able to find the issue and fix it.
        core.setFailed(err.message);
        core.debug(JSON.stringify(err));
    }
}

function getLineBreakChar(string) {
    const indexOfLF = string.indexOf('\n', 1);  // No need to check first-character

    if (indexOfLF === -1) {
        if (string.indexOf('\r') !== -1) {
            return '\r';
        }
        return '\n';
    }

    if (string[indexOfLF - 1] === '\r') {
        return '\r\n';
    }

    return '\n';
}

async function processFiles(config) {
    const paths = await glob(`${REPO_DIRECTORY}/**`, {
        ignore: config.ignorePaths.map(p => path.resolve(REPO_DIRECTORY, p)),
        nodir: true,
    }),
        files = [];
    let page = 0,
        changedFiles;
    core.info("Looking for changed files...");
    do {
        core.info(`Page ${++page}:`);
        changedFiles = await client.pulls.listFiles({
            owner,
            page,
            pull_number: context.payload.pull_request.number,
            repo,
        });
        core.debug(JSON.stringify(changedFiles.data));
        for (const element of changedFiles.data) {
            if (!paths.includes(`${REPO_DIRECTORY}/${element.filename}`)) {
                core.info(`${element.filename} is ignored. Skipping...`);
                continue;
            }
            if (!isText(element.filename)) {
                core.info(`${element.filename} is not a text file. Skipping...`);
                continue;
            }
            const file = await fs.readFile(element.filename, { encoding: "utf8" });
            if (file.endsWith("\n") || file.endsWith("\r")) {
                core.info(`${element.filename} is not compromised. Skipping...`);
                continue;
            }
            core.info(`${element.filename} is compromised. Fixing...`);
            const newFile = file.concat(getLineBreakChar(file));
            await fs.writeFile(element.filename, newFile);
            files.push(element.filename);
        }
    } while (changedFiles.data.length == 100);
    return files;
}

function generateMarkdownReport(results, autoCommit) {
    const ret = `
${results.length} file(s) ${autoCommit ? "had their final line ending fixed" : "are missing a line break at their end"}:
${results.map(function (element) {
        return `- \`${element}\`\n`;
    })}`;
    core.debug(ret);
    return ret;
}

async function convertToTreeBlobs(results) {
    const blobs = [];
    for (const path of results) {
        const content = await fs.readFile(path, { encoding: "utf8" });
        const blob = await client.git.createBlob({
            content,
            encoding: "utf8",
            owner,
            repo,
        });
        core.debug(JSON.stringify(blob.data));
        blobs.push({
            path: path.replace(REPO_DIRECTORY, "").replace(/\//, ""),
            mode: "100644",
            sha: blob.data.sha,
            type: "blob",
        });
    }
    return blobs;
}

async function createCommit(results) {
    const sha = context.payload.pull_request.head.sha;
    const latestCommit = await client.git.getCommit({
        commit_sha: sha,
        owner,
        repo,
    });
    core.debug(JSON.stringify(latestCommit.data));
    const tree = await client.git.createTree({
        base_tree: latestCommit.data.tree.sha,
        owner,
        repo,
        tree: await convertToTreeBlobs(results),
    });
    core.debug(JSON.stringify(tree.data));
    const commit = await client.git.createCommit({
        author: committer,
        message: "Fixed final line endings with Logerfo/newline-action.",
        owner,
        repo,
        tree: tree.data.sha,
        parents: [sha],
    });
    core.debug(JSON.stringify(commit.data));
    const event = await getEvent()
    const update = await client.git.updateRef({
        owner,
        repo,
        ref: `heads/${event.pull_request.head.ref}`,
        sha: commit.data.sha,
    });
    core.debug(JSON.stringify(update.data));
}

async function createComment(body) {
    const comment = await client.issues.createComment({
        body,
        issue_number: context.payload.pull_request.number,
        owner,
        repo,
    });
    core.debug(JSON.stringify(comment.data));
}

async function push() {
    const config = await getConfig()

    core.info("Locating files...");
    const results = await processFiles(config);
    if (!results.length) {
        core.info("No compromised files found. Skipping...");
        return;
    }

    core.info("Generating markdown report...");
    const markdown = generateMarkdownReport(results, config.autoCommit);

    if (config.autoCommit) {
        core.info("Committing files...");
        await createCommit(results);
    }
    else {
        core.info("Auto commit is disabled. Skipping...");
    }

    core.info("Leaving comment on PR...");
    await createComment(markdown);
}

run();
