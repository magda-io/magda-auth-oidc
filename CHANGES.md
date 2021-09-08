# v1.2.0

- change the way of locate session-db secret to be compatible with Magda v1 (still backwards compatible with earlier verisons)
- avoid using .Chart.Name for image name --- it will change when use chart dependecy alias
- adjustments to allow auth plugin to be used multiple times in a Magda deployment for different idps (via Helm Chart Alias).