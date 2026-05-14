## 1.0.0 (2026-05-14)

### Features

* add accessibility attributes to HTML renderers ([ea49b72](https://github.com/Mearman/schema-components/commit/ea49b7264b3dd496afba851d6bcee6a103e688fb))
* add default stylesheet for sc- prefixed HTML classes ([44d1a91](https://github.com/Mearman/schema-components/commit/44d1a91ce9f986567552070f6d698d3f3d78f7b1))
* add html renderer — render schemas to raw html strings ([a803cfb](https://github.com/Mearman/schema-components/commit/a803cfb4fb8a881115dc224abe15cb4325844fbb))
* add renderChild to RenderProps for theme adapter recursion ([24305a2](https://github.com/Mearman/schema-components/commit/24305a2793d80d7a29384ba5fda2c46861479952))
* add shadcn adapter, schema caching, and update readme/package ([fff4082](https://github.com/Mearman/schema-components/commit/fff40825bdb6e3820010dd7faa48a307549af7c9))
* add Storybook with GitHub Pages deployment ([eae9817](https://github.com/Mearman/schema-components/commit/eae98178e565fa10ba1c2f258887fafb08cafd37))
* add streaming HTML renderer with three output formats ([5d3fa4a](https://github.com/Mearman/schema-components/commit/5d3fa4a20b3c65af83059ab2b111fda9392085c1))
* add type-safe openapi components with generic inference ([683e950](https://github.com/Mearman/schema-components/commit/683e950cf08a52538bbfa873400386616ec98756))
* add typed errors, onError callback, and React error boundary ([893f9a1](https://github.com/Mearman/schema-components/commit/893f9a1fc251159c80a73b45fbc1d6f63f99a857))
* add unit tests and fix schema passthrough bug ([23092cc](https://github.com/Mearman/schema-components/commit/23092ccdac3cd37068b0eae08753ba654c50359a))
* flatten nested fields prop for walker field overrides ([a72ffbe](https://github.com/Mearman/schema-components/commit/a72ffbe776feb830830bf7bf68dd6fc9b0deb8d0))
* implement core library — walker, adapter, renderer, React components ([2c95a2e](https://github.com/Mearman/schema-components/commit/2c95a2e448b2646c4d6c4565ceb30e99500ce732))
* replace string templates with typed h() builder ([83525b1](https://github.com/Mearman/schema-components/commit/83525b115f77b39c949e566d4838332dae5f92ae))
* type-safe fields prop with generic SchemaComponent<T, Ref> ([3ea1495](https://github.com/Mearman/schema-components/commit/3ea14950e3d20eb80d8b16186803f3ab0ed28f84))
* type-safe path prop on generic SchemaField ([8d5fef7](https://github.com/Mearman/schema-components/commit/8d5fef7405d6c4b2f914e0481e501eaf633ddc5b))
* wire adapter, resolver, and SchemaField into SchemaComponent ([cbc2ce1](https://github.com/Mearman/schema-components/commit/cbc2ce158c080a1a84a940781b81d9d065e055b1))

### Bug Fixes

* propagate field key as path in HTML renderChild ([e3f471c](https://github.com/Mearman/schema-components/commit/e3f471c2ee308edf1e6406c1fc6f70bfac8c6b37))
* readOnly/writeOnly overrides propagate correctly to nested fields ([a809b62](https://github.com/Mearman/schema-components/commit/a809b62bbe08ae44d3fdaa9b277a3ded07c6009d))

### Refactoring

* centralise type guards, resolver lookup, and resolver merge ([be354ac](https://github.com/Mearman/schema-components/commit/be354ac35b6d73ec0bbc746fae58c35758991ce0))
* remove duplicate ComponentResolver types from types.ts ([39702c5](https://github.com/Mearman/schema-components/commit/39702c5ab622be825ad7f1ad222c07dca85c57a4))
* unify RenderProps and HtmlRenderProps via BaseFieldProps ([a408da9](https://github.com/Mearman/schema-components/commit/a408da9a2f4b4bacf81f0a85f6aad117fa69bb8a))
* use json schema as authoritative internal representation ([6a996c5](https://github.com/Mearman/schema-components/commit/6a996c53517d18f39cb341f10ed3fafdd7777547))

### Documentation

* add README for schema-components design document ([c1251e4](https://github.com/Mearman/schema-components/commit/c1251e4eea39e0154c3e8cc91e5482271bb4ce95))
* rewrite README to match actual API ([a8fc57f](https://github.com/Mearman/schema-components/commit/a8fc57fe5e650c9f4f886f0525c8c58e309a70aa))
* update readme for json schema walker architecture ([9649430](https://github.com/Mearman/schema-components/commit/9649430f76f2fbef6d0ea7a8d9fd81ff478f644f))
* update README with h() builder, streaming, accessibility, errors ([01d2a9f](https://github.com/Mearman/schema-components/commit/01d2a9f32dcdf3827ce117901cd1b6ff9c3e3d26))

### Tests

* add parser unit tests and integration tests ([338dba3](https://github.com/Mearman/schema-components/commit/338dba368007dd2d34172a8dacfdb76606a588c6))

### Chores

* add mit license and contributing guide ([7d51c29](https://github.com/Mearman/schema-components/commit/7d51c2957ab06fdd6c8bb4a384b3906e453ae786))
* **build:** remove barrel files, use direct module exports ([08d4f21](https://github.com/Mearman/schema-components/commit/08d4f2148e3e06c95fd1db3a9c5a733a419f3fdc))
* **build:** replace tsc with tsdown for library bundling ([38951b2](https://github.com/Mearman/schema-components/commit/38951b2ef0b770ec883f18fe9f3d4f4bf7181a5a))
* pin all GitHub Actions to latest versions, fix CI types ([29c5b6e](https://github.com/Mearman/schema-components/commit/29c5b6e156c9a3b59e656a26c4bf147a1e5b5321))
* rename to schema-components, adopt OIDC trusted publishing ([61e5c75](https://github.com/Mearman/schema-components/commit/61e5c753d5d103538213157f6fd4810572480d72))
* set up repo devops ([1042810](https://github.com/Mearman/schema-components/commit/1042810992bf4cb45e77efd680008c184f307210))
