# v1.2.1

- Upgrade to magda-common lib chart v1.0.0-alpha.4
- Use named templates from magda-common lib chart for docker image related logic

# v1.2.0

- Change the way of locate session-db secret to be compatible with Magda v1 (still backwards compatible with earlier versions)
- Avoid using .Chart.Name for image name --- it will change when use chart dependency alias
- Adjustments to allow auth plugin to be used multiple times in a Magda deployment for different idPs (via Helm Chart Alias).