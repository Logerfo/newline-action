[![Dependencies Status](https://david-dm.org/logerfo/newline-action/dev-status.svg)](https://david-dm.org/logerfo/newline-action?type=dev)

# Newline Action
This action will automatically fix files without a final new line in pull requests.  
Only works for UTF-8 files.

## Setting up
Create a file named `.github/workflows/newline.yml`.

### Minimal configuration
```yml
name: Final new line
on:
  pull_request:
    types: [synchronize, opened]
jobs:
  build:
    name: New line
    runs-on: ubuntu-16.04
    steps:
      - uses: actions/checkout@master
      - uses: Logerfo/newline-action@0.0.1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }} # The `GITHUB_TOKEN` secret.
```

### Complete configuration
All values are default.
```yml
name: Final new line
on:
  pull_request:
    types: [synchronize, opened]
jobs:
  build:
    name: New line
    runs-on: ubuntu-16.04
    steps:
      - uses: actions/checkout@master
      - uses: Logerfo/newline-action@0.0.1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }} # The `GITHUB_TOKEN` secret.
          config-path: .github/newline.yml
```

### Additional configurations file
You can optionally create a additional configuration file. The default path is `.github/newline.yml`, but you can change it in the action configuration file, as shown above.  
All values are default.
```yml
autoCommit: true # If false, the bot will still comment in the pull request, so you can known which files are wrong and fix them yourself.
ignorePaths: ["bin/**", "node_modules/**", "out/**"] # Globs to be ignored
```

### Auto update
You can use (at your own risk) the `release` branch instead of the specific version tag.  
Never user `master`, since the distribution file does not exist in this branch and the action will always fail.

## Changelog
Click [here](CHANGELOG.md).

## Contributing
If you have suggestions for how close-label could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## Donate

<img src="https://i.imgur.com/ndlBtuX.png" width="200">

BTC: 1LoGErFoNzE1gCA5fzk6A82nV6iJdKssSZ
