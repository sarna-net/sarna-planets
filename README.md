# Sarna.net Systems Project

Support code for the [sarna.net Systems Project](https://www.sarna.net/wiki/BattleTechWiki:Project_Systems).

For any questions please contact [Nic](https://www.sarna.net/wiki/User:Nicjansma).

## `planet-affected-list.js`

Determines nearby systems for the given planet.

Usage:

```sh
node planet-affected-list.js [planet] [max distance / 60 default]
```

Example:

```sh
node planet-affected-list.js Terra
```

## `planet-audit.js`

Uses `MediaWikiBot` to audit and edit systems to ensure their coordinates are correct.

**NOTE:** This can only be executed by a Sarna Admin.

Usage:

```sh
node planet-audit.js
```

## `planet-images.js`

Uses `MediaWikiBot` to upload current System images.

**NOTE:** This can only be executed by a Sarna Admin.

Usage:

```sh
node planet-images.js [single system - optional]
```

## `planet-nearby.js`

Uses `MediaWikiBot` to ensure the _Nearby Systems_ section of each system is correct.

Also makes minor changes to ensure _Map Gallery_ and _References_ are correct.

**NOTE:** This can only be executed by a Sarna Admin.

Usage:

```sh
node planet-nearby.js [single system - optional]
```
