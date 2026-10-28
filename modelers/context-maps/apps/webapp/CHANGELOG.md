# Changelog

## [0.8.1](https://github.com/Miragon/modeler-suite/compare/context-maps-webapp-v0.8.0...context-maps-webapp-v0.8.1) (2026-10-28)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.6 to 0.1.7
    * @miragon/context-maps-renderer bumped from 0.6.1 to 0.7.0
    * @miragon/context-maps-schema-model bumped from 0.4.1 to 0.5.0

## [0.8.0](https://github.com/Miragon/modeler-suite/compare/context-maps-webapp-v0.7.0...context-maps-webapp-v0.8.0) (2026-10-25)


### Features

* **shell:** run the kit per document and check that an empty file opens at 100 % with its hint ([#157](https://github.com/Miragon/modeler-suite/issues/157)) ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **shell:** treat EditContext and Monaco editors as text fields ([#137](https://github.com/Miragon/modeler-suite/issues/137)) ([ebacfca](https://github.com/Miragon/modeler-suite/commit/ebacfcacbadb6359d6acb2401486a6e9a8da5669))


### Bug Fixes

* **context-maps:** draw the canvas in the design guide's tokens, with a Lucide team glyph ([#142](https://github.com/Miragon/modeler-suite/issues/142)) ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** keep the description prompt under the palette ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** no em dashes in tooltips, validation messages, the sample title and the walkthrough ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** ship the licence of the Material star and hand with the extension and the web app ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** show the empty-file hint on an empty map after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **context-maps:** write a context's name black or white, whichever reads better on its fill ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **event-storming:** show the empty-file hint on an empty board after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **plugin:** show the empty-file hint after "New diagram" in the new-modeler template's web app ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **team-topologies:** show the empty-file hint on an empty diagram after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **value-chain:** show the empty-file hint on an empty diagram after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.5 to 0.1.6
    * @miragon/context-maps-renderer bumped from 0.6.0 to 0.6.1
    * @miragon/context-maps-schema-model bumped from 0.4.0 to 0.4.1
    * @miragon/modeler-shell bumped from 0.5.0 to 0.6.0

## [0.7.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.6.1...webapp-v0.7.0) (2026-10-23)


### Features

* **renderer:** start the legend card closed on every canvas size ([#95](https://github.com/Miragon/context-maps-modeler/issues/95)) ([52b1ce3](https://github.com/Miragon/context-maps-modeler/commit/52b1ce3fb2f51ff97e819fbb3b15352a70b1e809))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.5.0 to 0.6.0

## [0.6.1](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.6.0...webapp-v0.6.1) (2026-10-23)


### Bug Fixes

* **deps:** adopt modeler-shell 0.4.1, whose VS Code driver retries a missed theme switch ([#93](https://github.com/Miragon/context-maps-modeler/issues/93)) ([e4a20cb](https://github.com/Miragon/context-maps-modeler/commit/e4a20cb6d44bd9fcb4bfc3754570b8bc093aadea))

## [0.6.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.5.1...webapp-v0.6.0) (2026-10-23)


### Features

* **renderer:** report the content bounds a host fits to (contract 1.3); apps adopt modeler-shell 0.4.0 ([#91](https://github.com/Miragon/context-maps-modeler/issues/91)) ([f515215](https://github.com/Miragon/context-maps-modeler/commit/f515215618f7544e6945d72ca1e43f9795b799f1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.4.1 to 0.5.0

## [0.5.1](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.5.0...webapp-v0.5.1) (2026-10-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.4.0 to 0.4.1

## [0.5.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.4.0...webapp-v0.5.0) (2026-10-21)


### Features

* implement contract 1.2 of @miragon/modeler-api with modeler-shell 0.2.2 and refuse ids the canvas cannot draw ([#70](https://github.com/Miragon/context-maps-modeler/issues/70)) ([8136ccb](https://github.com/Miragon/context-maps-modeler/commit/8136ccbe280e3068c4074ad4fb0ab65fc7aca701))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.4 to 0.1.5
    * @miragon/context-maps-renderer bumped from 0.3.0 to 0.4.0
    * @miragon/context-maps-schema-model bumped from 0.3.0 to 0.4.0

## [0.4.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.3.0...webapp-v0.4.0) (2026-10-19)


### Features

* run Context Maps on @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#64](https://github.com/Miragon/context-maps-modeler/issues/64)) ([be9a0e3](https://github.com/Miragon/context-maps-modeler/commit/be9a0e3616600712fa68aebefaaf6695df2159b3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.3 to 0.1.4
    * @miragon/context-maps-renderer bumped from 0.2.1 to 0.3.0
    * @miragon/context-maps-schema-model bumped from 0.2.1 to 0.3.0

## [0.3.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.2.1...webapp-v0.3.0) (2026-10-08)


### Features

* use the Miragon modeler icon for app, favicon and file icons ([#55](https://github.com/Miragon/context-maps-modeler/issues/55)) ([3e4bb14](https://github.com/Miragon/context-maps-modeler/commit/3e4bb1443ce9ccfc12a139746ca8e80b368fefa5))

## [0.2.1](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.2.0...webapp-v0.2.1) (2026-09-22)


### Bug Fixes

* **deps:** align shared runtime deps with peerDependencies convention ([#49](https://github.com/Miragon/context-maps-modeler/issues/49)) ([b3aba28](https://github.com/Miragon/context-maps-modeler/commit/b3aba28a72d37992645cd85d5b7fd67f63f78a4f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.2 to 0.1.3
    * @miragon/context-maps-renderer bumped from 0.2.0 to 0.2.1
    * @miragon/context-maps-schema-model bumped from 0.2.0 to 0.2.1

## [0.2.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.1.1...webapp-v0.2.0) (2026-09-02)


### Features

* **renderer:** ship context pad, notation legend and palette tools ([#41](https://github.com/Miragon/context-maps-modeler/issues/41)) ([cdcd1d6](https://github.com/Miragon/context-maps-modeler/commit/cdcd1d650df73db106fedb5e072d526ca511f17a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.1 to 0.1.2
    * @miragon/context-maps-renderer bumped from 0.1.0 to 0.2.0
    * @miragon/context-maps-schema-model bumped from 0.1.0 to 0.2.0

## [0.1.1](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.1.0...webapp-v0.1.1) (2026-08-10)


### Bug Fixes

* add missing css ([#30](https://github.com/Miragon/context-maps-modeler/issues/30)) ([69d069e](https://github.com/Miragon/context-maps-modeler/commit/69d069e3e99e0b31f99a79aab4618b1d55d1fd6f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.0 to 0.1.1

## [0.1.0](https://github.com/Miragon/context-maps-modeler/compare/webapp-v0.0.1...webapp-v0.1.0) (2026-08-10)


### Features

* adopt Miragon corporate identity ([#23](https://github.com/Miragon/context-maps-modeler/issues/23)) ([2f22053](https://github.com/Miragon/context-maps-modeler/commit/2f220530f37e79e81a729f8956d9fa72a9d91e69))
* implement legend box on the left side ([#25](https://github.com/Miragon/context-maps-modeler/issues/25)) ([8746eda](https://github.com/Miragon/context-maps-modeler/commit/8746edafe2f1317314c6e1ecf0f59e458bc98402))
* model pretty context maps ([c4ba93e](https://github.com/Miragon/context-maps-modeler/commit/c4ba93e2e4a411917aec491644314a9f7455231a))
* show a starting page when no diagram is present ([#24](https://github.com/Miragon/context-maps-modeler/issues/24)) ([d69e677](https://github.com/Miragon/context-maps-modeler/commit/d69e677992e29322273fe18f83e31f1a2ed7d5c2))


### Bug Fixes

* draw line between components ([#6](https://github.com/Miragon/context-maps-modeler/issues/6)) ([b11d2b4](https://github.com/Miragon/context-maps-modeler/commit/b11d2b4779df9d73608e85de98bb890408b14313))
* modelling issues ([#4](https://github.com/Miragon/context-maps-modeler/issues/4)) ([af2c585](https://github.com/Miragon/context-maps-modeler/commit/af2c585633264418ba4463302fd5e8dd18c41904))
* **webapp:** drive portless dev via portless.json, correct docs, pin portless 0.15.3 ([#16](https://github.com/Miragon/context-maps-modeler/issues/16)) ([f26bd1d](https://github.com/Miragon/context-maps-modeler/commit/f26bd1da41f8929a63f6a0d0250259bc5c29b899))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.0.1 to 0.1.0
    * @miragon/context-maps-renderer bumped from 0.0.1 to 0.1.0
    * @miragon/context-maps-schema-model bumped from 0.0.1 to 0.1.0

## Changelog
