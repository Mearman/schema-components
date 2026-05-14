## [1.8.0](https://github.com/Mearman/schema-components/compare/v1.7.1...v1.8.0) (2026-05-14)

### Features

* **build:** add headless renderer preview styles for storybook ([460536e](https://github.com/Mearman/schema-components/commit/460536e390e682121c3124e4ee338c953942634e))

## [1.7.1](https://github.com/Mearman/schema-components/compare/v1.7.0...v1.7.1) (2026-05-14)

### Documentation

* update README and add Storybook stories for visibility, ordering, and per-field validation ([4be4b6f](https://github.com/Mearman/schema-components/commit/4be4b6feaaa4819937280c010eacb3f36a521a54))

## [1.7.0](https://github.com/Mearman/schema-components/compare/v1.6.0...v1.7.0) (2026-05-14)

### Features

* add field visibility and ordering controls ([27cb3e1](https://github.com/Mearman/schema-components/commit/27cb3e19ba930200116c79293078fa6fa2743723))

## [1.6.0](https://github.com/Mearman/schema-components/compare/v1.5.1...v1.6.0) (2026-05-14)

### Features

* add per-field onValidationError and writeOnly tests ([bc65589](https://github.com/Mearman/schema-components/commit/bc655893601b8e015dd3c717eccc9bf9dffbbb42))

### Tests

* add writeOnly behaviour tests across all renderers ([abfb293](https://github.com/Mearman/schema-components/commit/abfb293498efc4d4095dec072fd1e5a9c3239035))

## [1.5.1](https://github.com/Mearman/schema-components/compare/v1.5.0...v1.5.1) (2026-05-14)

### Bug Fixes

* blank writeOnly values in boolean and number renderers ([b46ecac](https://github.com/Mearman/schema-components/commit/b46ecac8d997fd4b875d6090d5374cded1143e5d))

## [1.5.0](https://github.com/Mearman/schema-components/compare/v1.4.0...v1.5.0) (2026-05-14)

### Features

* add storybook stories for widgets, SchemaView, defaults, editability, and records ([e36720e](https://github.com/Mearman/schema-components/commit/e36720e09edcba11374eca77394f000a62261309))

## [1.4.0](https://github.com/Mearman/schema-components/compare/v1.3.3...v1.4.0) (2026-05-14)

### Features

* add scoped widget resolution at instance, context, and global levels ([b330baf](https://github.com/Mearman/schema-components/commit/b330baf183d00bebf999108f16c9dabd40c243be))

### Documentation

* update README with scoped widget resolution documentation ([21ac50d](https://github.com/Mearman/schema-components/commit/21ac50dc9a55144fc319fcf482ffad6a16585a27))

## [1.3.3](https://github.com/Mearman/schema-components/compare/v1.3.2...v1.3.3) (2026-05-14)

### Refactoring

* extract pure resolution layer from openapi components ([5e0ab32](https://github.com/Mearman/schema-components/commit/5e0ab32de44b41b23e74082886a5ae881b418883))

### Tests

* add guards unit tests ([39f53ab](https://github.com/Mearman/schema-components/commit/39f53abf4cf30f1751a09267f34990c4a2532567))
* add openapi resolution and component unit tests ([75a5892](https://github.com/Mearman/schema-components/commit/75a589220f05b5649a531bec946a63093e824687))
* add renderer utility unit tests ([3ca3677](https://github.com/Mearman/schema-components/commit/3ca367709acf6324a33a79adf3799528971defc2))
* expand html and streaming coverage, tighten vitest config ([ac480cd](https://github.com/Mearman/schema-components/commit/ac480cdeb39cf2ae0fa3107de2abae39102cfa26))

## [1.3.2](https://github.com/Mearman/schema-components/compare/v1.3.1...v1.3.2) (2026-05-14)

### Refactoring

* migrate all tests from node:test to vitest ([457ff24](https://github.com/Mearman/schema-components/commit/457ff24ab667330848d3ddf8b578211dbfc31f34))

## [1.3.1](https://github.com/Mearman/schema-components/compare/v1.3.0...v1.3.1) (2026-05-14)

### CI

* add storybook component test job ([4441151](https://github.com/Mearman/schema-components/commit/4441151b9d2ac7255f8116235a9793440841d462))

## [1.3.0](https://github.com/Mearman/schema-components/compare/v1.2.0...v1.3.0) (2026-05-14)

### Features

* add storybook testing with vitest addon, a11y, and browser mode ([e32944e](https://github.com/Mearman/schema-components/commit/e32944edf2f54b04d50bcf93ffc678e77d5615e4))

### Bug Fixes

* strip children from mui stub void elements ([49de9c6](https://github.com/Mearman/schema-components/commit/49de9c6f48cdc30c37fbdcfad561b95e74e7db7b))

### Chores

* exclude errors stories from component tests ([7b04129](https://github.com/Mearman/schema-components/commit/7b04129f9e3a58edecfd65560dba5b6ba7ffbd76))

## [1.2.0](https://github.com/Mearman/schema-components/compare/v1.1.0...v1.2.0) (2026-05-14)

### Features

* add date/time and discriminated union stories ([595c559](https://github.com/Mearman/schema-components/commit/595c559c98beab7fdf28790513597bfce8c773cd))
* comprehensive accessibility improvements ([ed11b2e](https://github.com/Mearman/schema-components/commit/ed11b2e7c408960a94c27d65f0869836720e179c))
* discriminated union UI, date/time inputs, schema defaults ([5cde96e](https://github.com/Mearman/schema-components/commit/5cde96e77e6af642b4973cc84b0aff129813318f))
* file upload renderer ([3742384](https://github.com/Mearman/schema-components/commit/37423849d045e9e044667d1206336207b7c60f05))
* mui theme adapter and coverage enforcement ([adeb0b6](https://github.com/Mearman/schema-components/commit/adeb0b6bab3ee2c34fe78d26db10f5d082396cc6))
* ssr tests and server component (SchemaView) ([7268f09](https://github.com/Mearman/schema-components/commit/7268f0918981030b55005678168cb3726c75dd74))

### Bug Fixes

* exclude ssr e2e test from tsconfig ([f9248cd](https://github.com/Mearman/schema-components/commit/f9248cd32c809992873153e268c77b26d4b3f1a1))

### Refactoring

* rename ssr test from integration to e2e ([b373e3a](https://github.com/Mearman/schema-components/commit/b373e3aa8842906ce4a53259b640eaad9f410fb6))

### Documentation

* add discriminated unions, date/time, defaults to README ([91bc96c](https://github.com/Mearman/schema-components/commit/91bc96c7700c81c8c903f2ba9e1a6ced4e4b5c83))

### CI

* add ssr e2e step and separate test script ([e023d8b](https://github.com/Mearman/schema-components/commit/e023d8bddb2f34d88059a74cab05ef391f4957b8))

### Chores

* downgrade storybook 10.4.0 to 10.3.6 and vite 8.0.12 to 8.0.11 ([e3f8341](https://github.com/Mearman/schema-components/commit/e3f83419cea890517d69fda8ea0a3ef3ba8fb619))
* update dependencies (tsdown 0.22.0) ([1fc7dc0](https://github.com/Mearman/schema-components/commit/1fc7dc05f91fdabd98317684eb8bce49136c3c32))

## [1.1.0](https://github.com/Mearman/schema-components/compare/v1.0.0...v1.1.0) (2026-05-14)

### Features

* add validation, recursive, and OpenAPI operation stories ([d1b742e](https://github.com/Mearman/schema-components/commit/d1b742e58e57e7c11ce36a7a868e1efc2574a04b))
* expand Storybook coverage with JSON Schema, streaming, and error stories ([4378701](https://github.com/Mearman/schema-components/commit/4378701b29bcd1ebec5b8caf46bdd452d4b0f766))

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
