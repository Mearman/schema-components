## [3.2.0](https://github.com/Mearman/schema-components/compare/v3.1.1...v3.2.0) (2026-05-29)

### Features

* extend schema-builder-ui to cover all field types ([c5cac44](https://github.com/Mearman/schema-components/commit/c5cac44acae6fb354a92d71b59287b71476172a6))
* upgrade builder app shell to surface all schema-components features ([b3f19a9](https://github.com/Mearman/schema-components/commit/b3f19a97149b26a5b86d921f12cececc021c019d))

## [3.1.1](https://github.com/Mearman/schema-components/compare/v3.1.0...v3.1.1) (2026-05-29)

### Bug Fixes

* set builder app base path to /schema-components/builder/ ([1f2835a](https://github.com/Mearman/schema-components/commit/1f2835aef7d4fc87d1f186068c9e872a3d1cb6bb))

## [3.1.0](https://github.com/Mearman/schema-components/compare/v3.0.2...v3.1.0) (2026-05-29)

### Features

* add schema-builder-ui package and standalone builder app ([2e06b0d](https://github.com/Mearman/schema-components/commit/2e06b0dee3ae94edbe4295476dfa4e745e2202f7))
* **storybook:** add view templates story ([cc14eea](https://github.com/Mearman/schema-components/commit/cc14eea3562461acf89ea80504229f40542acbd9))

### Bug Fixes

* add component annotation to ViewTemplates story meta ([b2c7d43](https://github.com/Mearman/schema-components/commit/b2c7d43e5c0dc75ebeddce56d4b7e14dcfa1aeda))
* add eslint and plugins as devDependencies of schema-builder-ui ([a0a93e5](https://github.com/Mearman/schema-components/commit/a0a93e52cf81fa33bc89f7ecdc91a9a27f3260ca))
* **ci:** auto-update README API inventory in release job ([283054d](https://github.com/Mearman/schema-components/commit/283054d1c20bc0c45dd00d168f527a6df475c276))
* resolve eslint errors and restore apps/* in workspace config ([79659c4](https://github.com/Mearman/schema-components/commit/79659c4a21aa189e34c40a8fbcce6ab9e2d6b5af))
* resolve eslint errors in schema-builder-ui ([93abefc](https://github.com/Mearman/schema-components/commit/93abefc93ff5a5a25552e3015326f495a7c5305b))
* resolve exactOptionalPropertyTypes errors in FieldConfig ([2e7127e](https://github.com/Mearman/schema-components/commit/2e7127e59a87cdfb85d90d8a4d78a79f3ed680b9))
* use pnpm exec eslint in schema-builder-ui lint script ([47f0295](https://github.com/Mearman/schema-components/commit/47f029547816a55b2fe9dc1043ea7dc7e110c588))

### Refactoring

* use discriminated union for BuilderField ([fc2562a](https://github.com/Mearman/schema-components/commit/fc2562aa88ac8966e774c0d6253b30110e6638e7))

### Styles

* fix prettier formatting in schema-builder-ui ([79f2d6b](https://github.com/Mearman/schema-components/commit/79f2d6b5232b55cf04649c86becb9061481ce87e))

### CI

* add builder app to Pages deploy and check jobs ([a101580](https://github.com/Mearman/schema-components/commit/a101580eec92c65b0bd43b93cd4c3aa53a7c4b3d))
* build schema-builder-ui before checking builder app ([f06b2a4](https://github.com/Mearman/schema-components/commit/f06b2a406e6bd54c9699a05ce050ed9b1b2690f5))

### Chores

* extend pre-push hook to validate schema-builder-ui and builder app ([f7e9ac5](https://github.com/Mearman/schema-components/commit/f7e9ac519afc185f7997783d697122d9cf2d73aa))

## [3.0.2](https://github.com/Mearman/schema-components/compare/v3.0.1...v3.0.2) (2026-05-19)

### Tests

* **lit:** strengthen schemaRef test with decoy schema and unconditional assertions ([62319c6](https://github.com/Mearman/schema-components/commit/62319c683fb4fbff5ed2e24ba5d797bbac6ea923))

## [3.0.1](https://github.com/Mearman/schema-components/compare/v3.0.0...v3.0.1) (2026-05-19)

### Refactoring

* **svelte:** rename Svelte generic parameter from Ref to SchemaRef ([746ef74](https://github.com/Mearman/schema-components/commit/746ef74374b39f301a1cd9dd3aee0a509706bcaa))

### Tests

* **lit:** cover schemaRef OpenAPI ref resolution ([400b021](https://github.com/Mearman/schema-components/commit/400b021383088d57be90847223b6a1b41dd7c1cf))
* **solid:** cover schemaRef OpenAPI ref resolution ([f87dc17](https://github.com/Mearman/schema-components/commit/f87dc175adb425746c5269f6e84889ebba9c3af9))
* **svelte:** cover schemaRef OpenAPI ref resolution ([0f150a3](https://github.com/Mearman/schema-components/commit/0f150a3e7cc481cb5644975039e1054d8852ca39))
* **vue:** cover schemaRef OpenAPI ref resolution ([f2fbb47](https://github.com/Mearman/schema-components/commit/f2fbb47ed9f609a0db13dfa7ece07be32b2fec8c))

## [3.0.0](https://github.com/Mearman/schema-components/compare/v2.1.1...v3.0.0) (2026-05-19)

### ⚠ BREAKING CHANGES

* **react:** `<SchemaComponent>`, `<SchemaView>`, and
`<SchemaField>`'s `ref` prop is renamed to `schemaRef`. The
`SchemaComponentProps`, `SchemaViewProps`, and `SchemaFieldProps`
generic parameter is renamed from `Ref` to `SchemaRef` to match.
Lower-level type utilities in `core/typeInference.ts` keep their
`Ref` generic parameter name unchanged.

Migration: rename every `ref="..."` on `<SchemaComponent>` /
`<SchemaView>` / `<SchemaField>` instance (and the corresponding
`ref:` key when constructing via `createElement` or `args`) to
`schemaRef`. A mechanical find-and-replace is sufficient; TypeScript
catches misses at compile time.
* **vue:** Vue `<SchemaComponent>`, `<SchemaView>`, and
`<SchemaField>`'s `refPath` prop is renamed to `schemaRef`. Migration:
rename every `:refPath="X"` or `refPath="X"` on a Vue SchemaComponent
instance to `:schemaRef="X"` or `schemaRef="X"`.
* **solid:** Solid `<SchemaComponent>`, `<SchemaView>`, and
`<SchemaField>`'s `ref` prop is renamed to `schemaRef`. Update
call sites that pass an OpenAPI `$ref` string via the `ref` prop
to use `schemaRef` instead.
* **svelte:** Svelte `<SchemaComponent>`, `<SchemaView>`, and
`<SchemaField>`'s `ref` prop is renamed to `schemaRef`. Update
every call site that passes `ref="#/components/schemas/..."` to
pass `schemaRef="..."` instead.
* **lit:** Lit `<schema-component>`, `<schema-view>`, and
`<schema-field>`'s `ref` property is renamed to `schemaRef`.
The element tag names are unchanged.

Migration: in JS, change `element.ref = "X"` to
`element.schemaRef = "X"`. In Lit templates, change `.ref=${X}`
to `.schemaRef=${X}`.

### Features

* **lit:** rename Lit schema-component .ref property to schemaRef ([d81142f](https://github.com/Mearman/schema-components/commit/d81142f9b612d5aa5397fa5b27df7d6ffb0e9a90))
* **react:** rename SchemaComponent.ref prop to schemaRef ([b70cefe](https://github.com/Mearman/schema-components/commit/b70cefea89f2596c6b6fd0edde60a605fecf6fe3))
* **solid:** rename Solid SchemaComponent.ref prop to schemaRef ([e32fd86](https://github.com/Mearman/schema-components/commit/e32fd8606e0785c24c767243c907b1c2686572a6))
* **svelte:** rename Svelte SchemaComponent.ref prop to schemaRef ([5a0617f](https://github.com/Mearman/schema-components/commit/5a0617fc848dab78e542e3bf5e6f5701743ecebd))
* **vue:** rename Vue SchemaComponent.refPath prop to schemaRef ([0abecb8](https://github.com/Mearman/schema-components/commit/0abecb8c89fe5333924ce56a068b3be486c1ee6b))

## [2.1.1](https://github.com/Mearman/schema-components/compare/v2.1.0...v2.1.1) (2026-05-19)

### Refactoring

* **html:** route streaming leaf path through dispatchRenderField ([e3e3e41](https://github.com/Mearman/schema-components/commit/e3e3e41a9eaea58b6b515cccdf9c3dc365bb6b1b))

### Documentation

* **vue:** document Vue adapter ships as source ([2d527da](https://github.com/Mearman/schema-components/commit/2d527dac8ca4b3db1ec687c9f33ddb69e0863262))

### Tests

* **preact:** close the 14 preact/compat false negatives ([5470f10](https://github.com/Mearman/schema-components/commit/5470f100f38b9e2fb2c7b5035c5b8f7d96d1fcd5))

### Build

* **vue:** ship Vue adapter source in published tarball ([f95caf0](https://github.com/Mearman/schema-components/commit/f95caf068065b88b3ea13af41b746117e9ddbfd1))

## [2.1.0](https://github.com/Mearman/schema-components/compare/v2.0.2...v2.1.0) (2026-05-19)

### Features

* **core:** add abstract context port for framework adapters ([2c5610a](https://github.com/Mearman/schema-components/commit/2c5610aeca6e808fc8b7e07f917c671da115ecf0))
* **core:** add lit web components adapter with sc-* custom elements ([0654e33](https://github.com/Mearman/schema-components/commit/0654e333e0ac830ed59626d2b8d02acb5cd4d551))
* **core:** add preact entry point as thin alias of react adapter ([679ab1d](https://github.com/Mearman/schema-components/commit/679ab1dd9988095627097d9462450450b536e5b0))
* **core:** add Solid adapter mirroring the React surface ([afa4473](https://github.com/Mearman/schema-components/commit/afa44734e756f332c219dd2168923ffbfb30c805))
* **core:** add svelte 5 adapter with headless renderers ([1895f9b](https://github.com/Mearman/schema-components/commit/1895f9b603f1c2dc6147086c552aa3bc49fd4419))
* **core:** add Vue 3 adapter with headless renderers and SFC entry points ([09b7b04](https://github.com/Mearman/schema-components/commit/09b7b0466d6646a8697abe42e59ba2fc1ce208e7))
* **core:** use declare-only fields in lit elements to avoid class-field shadowing ([0765a25](https://github.com/Mearman/schema-components/commit/0765a25da12a2b458d62d33aa4112beb2f545676))

### Bug Fixes

* **build:** include preact, solid, and lit adapters in bundled output ([de7475c](https://github.com/Mearman/schema-components/commit/de7475cc0b7c1fb194eae898bdcf2222888550e4))
* **core:** align bracket-notation test fixtures with canonical WalkedField shape ([5f2b330](https://github.com/Mearman/schema-components/commit/5f2b33042bdabc063ce6025e576acca93f6edb0f))
* **lit:** import canonical ContextPort from core/contexts.ts ([065f17d](https://github.com/Mearman/schema-components/commit/065f17d4f1e13ceeda3b8002b889886b44b4023a))
* **solid:** align contexts port with canonical ContextPort shape ([f652b5d](https://github.com/Mearman/schema-components/commit/f652b5d4d5058b56b335494b3c7fd946849fefc1))

### Refactoring

* **core:** extract render-field dispatch loop into core/renderField ([b2fa279](https://github.com/Mearman/schema-components/commit/b2fa279124595fb79a6873a7174b9838d0d18590))
* **core:** generalise renderer types over output and props ([477b7e6](https://github.com/Mearman/schema-components/commit/477b7e68ecb50b51d3cabc11adf2d2b12ab1fe92))
* **core:** move fieldPath helpers from react/ to core/ ([5e6ca00](https://github.com/Mearman/schema-components/commit/5e6ca0073df50c25862f8fde01276bc641187d8d))
* **html:** consume core/renderField in renderToHtml ([2548309](https://github.com/Mearman/schema-components/commit/2548309ce8ac7cabae7f0520578eab4db9b353fa))
* **react:** consume core/renderField in SchemaComponent and SchemaView ([2e91669](https://github.com/Mearman/schema-components/commit/2e916692f662816fa61f61915ac2f075465dcc7d))

### Documentation

* **core:** document lit adapter — tags, parts, ssr caveats, design qs ([a62998f](https://github.com/Mearman/schema-components/commit/a62998fb3f0682cbb151c2ef5f18930fb6c974b0))
* **core:** document preact support in the core readme ([593d1c0](https://github.com/Mearman/schema-components/commit/593d1c077bfe0fefdd0346fce43b0f9409e16ed5))

### Tests

* **core:** add svelte adapter unit tests covering the dispatch chain ([b866885](https://github.com/Mearman/schema-components/commit/b866885916da564633f3c3762fe899c6d3ec89ba))
* **core:** add Vue adapter test suite ([759c34e](https://github.com/Mearman/schema-components/commit/759c34ece0ab7a8af31a598b1567fb3991c0bfa6))
* **core:** cover bracket-notation paths in fieldPath helpers ([8151e9e](https://github.com/Mearman/schema-components/commit/8151e9e646543c4a24359f1b137b8815ae0b9763))
* **core:** cover lit adapter with unit-lit project (28 tests) ([6fd095f](https://github.com/Mearman/schema-components/commit/6fd095faeeed2658c0e9db14e5781ffba6c9a256))
* **core:** cover the Solid adapter across renderers, tabs, and types ([4ca389c](https://github.com/Mearman/schema-components/commit/4ca389c9b553f971c9b56f4f30609b62c526c813))
* **core:** run unit suite under preact/compat aliasing ([0f94d7e](https://github.com/Mearman/schema-components/commit/0f94d7e83b69c5f33ff0a59c39499ff9751b26d4))

### Build

* **core:** wire svelte vitest project, turbo task, and bundler exclusion ([4447f9d](https://github.com/Mearman/schema-components/commit/4447f9df9f05a27590dbc2cc3105abbfd5001ca1))
* **deps:** add lit, @lit/context, @lit-labs/ssr for lit adapter ([bef46b3](https://github.com/Mearman/schema-components/commit/bef46b31b24b012ee72bbc7898a0c1716992baf9))
* **deps:** add preact and preact-render-to-string as dev dependencies ([a027d3b](https://github.com/Mearman/schema-components/commit/a027d3b570b632e3266f8300fa69782a0ae4e270))
* **deps:** add svelte 5 peer dep and devDependencies ([e2ccf99](https://github.com/Mearman/schema-components/commit/e2ccf9900ff1501d2bbe7aeb7af79cd610b7c34a))
* **deps:** add vue, @vue/test-utils, and @vitejs/plugin-vue ([e22e01a](https://github.com/Mearman/schema-components/commit/e22e01a11df10208320cb897341a403807bbf072))
* wire pnpm test:vue script and unit-vue vitest project ([12f699a](https://github.com/Mearman/schema-components/commit/12f699aa29e7faf309c8a1621eab804f596e069d))

### Chores

* **build:** allow framework adapter scopes in commitlint ([9f0f629](https://github.com/Mearman/schema-components/commit/9f0f629fb5928f073bc5e4cb681febca5006e7d1))
* **build:** force devalue >=5.8.1 to patch GHSA-77vg-94rm-hx3p ([b69d16e](https://github.com/Mearman/schema-components/commit/b69d16e9369560e69c5570f030713530c6b54bc6))

## [2.0.2](https://github.com/Mearman/schema-components/compare/v2.0.1...v2.0.2) (2026-05-19)

### Documentation

* **core:** fix tsdoc code-span warnings in uri.ts ([07e2df5](https://github.com/Mearman/schema-components/commit/07e2df58488b54a405ff8f98131b3ce4e06202eb))
* **core:** fix tsdoc escape-greater-than warnings in normalise.ts ([3908736](https://github.com/Mearman/schema-components/commit/3908736ac058dc4f73820a7a0ff2a8cef1953401))
* **core:** fix tsdoc escape-greater-than warnings in walker.ts ([535040c](https://github.com/Mearman/schema-components/commit/535040c898d35cdaafb7891037d896aa70c6752c))
* **core:** fix tsdoc html-tag warning in guards.ts header ([cd1b073](https://github.com/Mearman/schema-components/commit/cd1b073175d696680460131e18d1033af0fa97f9))
* **core:** fix tsdoc html-tag warning in walkBuilders.ts ([924710d](https://github.com/Mearman/schema-components/commit/924710d2df0ec85144fb0b856e9b79fd2d4288e4))
* **core:** fix tsdoc html-tag warnings in inferValue.ts ([2f85281](https://github.com/Mearman/schema-components/commit/2f852811e071651a6d82c69a2714968da77b396e))
* **core:** fix tsdoc inline-tag warnings in openapi30.ts ([edcc34e](https://github.com/Mearman/schema-components/commit/edcc34e83ca8776674e286de870cd04404a66599))
* **core:** fix tsdoc syntax in typeInference.ts comments ([0e322a0](https://github.com/Mearman/schema-components/commit/0e322a056df925b676030b20bd518a3c322c1665))
* **core:** fix tsdoc syntax warnings in adapter.ts ([eaab046](https://github.com/Mearman/schema-components/commit/eaab04635c5091fe58608157e78449847ec8980a))
* **core:** fix tsdoc unnecessary-backslash warning in swagger2.ts ([0ef8eab](https://github.com/Mearman/schema-components/commit/0ef8eab4ab9e39c3e3d54218f76d9181508bdcdf))
* **html:** wrap html.ts usage example in fenced code block ([55fa22d](https://github.com/Mearman/schema-components/commit/55fa22d3f8d72bd59062711b6f09491f8b9912d3))
* **html:** wrap renderToHtml usage examples in fenced code blocks ([7390268](https://github.com/Mearman/schema-components/commit/7390268dc53f958251c1a81434c2c9e558e763fe))
* **openapi:** fix tsdoc escape-greater-than warnings in components.tsx ([15bf618](https://github.com/Mearman/schema-components/commit/15bf6180e0a8982f5b8c95c11b83015461eafc3d))
* **react:** fix tsdoc syntax warnings in schema component JSDoc ([354a979](https://github.com/Mearman/schema-components/commit/354a979649c347c0fbe7e6229ee40a175965143d))
* **themes:** fix tsdoc/syntax warnings in theme adapter docblocks ([cd30bf9](https://github.com/Mearman/schema-components/commit/cd30bf9357dd2fef2361329adb6aa58958a36948))

## [2.0.1](https://github.com/Mearman/schema-components/compare/v2.0.0...v2.0.1) (2026-05-19)

### Chores

* **core:** declare [@group](https://github.com/group) as a TSDoc block tag ([e8dd286](https://github.com/Mearman/schema-components/commit/e8dd28620ee0ad5678e25853f17209a614c61498))
* **deps:** add eslint-plugin-tsdoc syntax rule as warning ([8229438](https://github.com/Mearman/schema-components/commit/822943869f12fd1c10292cde98407924f82a2807))

## [2.0.0](https://github.com/Mearman/schema-components/compare/v1.29.0...v2.0.0) (2026-05-19)

### ⚠ BREAKING CHANGES

* **html:** `fieldId`, `panelId`, and `tabId` are no longer
exported from `schema-components/html/renderers`. Migrate to
`fieldDomId`, `panelIdFor`, and `tabIdFor` from
`schema-components/core/idPath`.
* **openapi:** the five `resolveXFromParsed` exports are removed.
Migrate by calling `resolveX(doc, ...)` — either form (raw document or
parsed) is accepted.
* **openapi:** the ten parser functions are renamed:

- `getSchema` → `extractSchema`
- `getParameters` → `extractParameters`
- `getRequestBody` → `extractRequestBody`
- `getResponses` → `extractResponses`
- `getSecurityRequirements` → `extractSecurityRequirements`
- `getSecuritySchemes` → `extractSecuritySchemes`
- `getResponseHeaders` → `extractResponseHeaders`
- `getExternalDocs` → `extractExternalDocs`
- `getXmlInfo` → `extractXmlInfo`
- `getLinks` → `extractLinks`
* **openapi:** `ApiOperationProps` now carries two additional generic
parameters (`ResponseStatus`, `ResponseContentType`). Consumers that
referenced `ApiOperationProps<Doc, Path, Method, ContentType>`
explicitly continue to compile because both new parameters default to
the union of declared statuses / media types.
* **core:** `SchemaInput` is no longer exported from
`schema-components/core/adapter`. Use `unknown` (or the specific shape
your call site requires) directly.
* **react:** `<SchemaComponent path>` no longer exists. The third
generic argument of `SchemaComponentProps` is also removed. Migrate to
`<SchemaField path="...">` for runtime sub-path rendering.
* **core:** `ComponentResolver.recursive` and `HtmlResolver.recursive`
are removed. They had no runtime effect, so any code referencing them
was already a no-op.
* **themes:** `registerMuiComponents`, `registerMantineComponents`,
and `registerRadixComponents` are removed. Call
`createMuiResolver(...)`, `createMantineResolver(...)`, or
`createRadixResolver(...)` with the element-type bag and use the
returned resolver directly.
* **core:** DEFAULT_REF_CHAIN_MAX_HOPS is no longer exported
from schema-components/core/refChain. Import MAX_PATH_ITEM_REF_HOPS
from schema-components/core/limits instead.
* **core:** WidgetMap is no longer exported from
schema-components/react/SchemaComponent. Import it from
schema-components/core/renderer instead.

### Features

* **core:** make `WalkOptions` generic in the schema value type ([12decd9](https://github.com/Mearman/schema-components/commit/12decd98a58cf923167831f30a70f2b2b9aca613))
* **html:** thread schema-typed generics through HTML render entries ([6ed53a8](https://github.com/Mearman/schema-components/commit/6ed53a8c2f3a26b6a8c986a98591af69df5bfaf6))
* **openapi:** type `ApiOperation` request/response values ([a424e50](https://github.com/Mearman/schema-components/commit/a424e505360ad42b876b57bedf38c2731086b66f))
* **react:** plumb ARIA scaffolding through every theme adapter via FieldShell ([bc1fb7b](https://github.com/Mearman/schema-components/commit/bc1fb7bf3038c4b4cfdad01cd1d07e87f340681e))
* **react:** type `SchemaView.fields` against `InferFields<T, Ref>` ([570fcfd](https://github.com/Mearman/schema-components/commit/570fcfd422a51f4646661a25ab283ea90c6ca8e3))

### Bug Fixes

* **core:** disambiguate DOM ids for non-ASCII field names ([c828e0d](https://github.com/Mearman/schema-components/commit/c828e0de8f21c6eba3ce36089fcfd1f07a0b1da1))
* **core:** emit diagnostic for duplicate discriminator const values ([82b12ec](https://github.com/Mearman/schema-components/commit/82b12ec830fe24c644e71a6e44ff44ed459c5a65))
* **core:** emit prototype-polluting-property diagnostic in merge and swagger2 normalisation ([2870017](https://github.com/Mearman/schema-components/commit/28700173f753141c0fbb8c4a025598d19fce3879))
* **core:** reject control-byte and percent-encoded uri payloads ([04eef81](https://github.com/Mearman/schema-components/commit/04eef819e785bc4b4fb4940c2e3e057aeb2c991a))
* **core:** render writeOnly + format=password as masked credential input ([7c2ccc1](https://github.com/Mearman/schema-components/commit/7c2ccc163f72f03878a33fc96a97e5c447af59cb))
* **core:** wire inputmode and step on number inputs from schema ([d6fcbd6](https://github.com/Mearman/schema-components/commit/d6fcbd6270834641eda56449fd1fc752d602c200))
* **html:** associate record entry labels with inputs via for= ([caf88f8](https://github.com/Mearman/schema-components/commit/caf88f855cfdbc6da76727cc0ce741bc7846fb4c))
* **html:** derive streaming hint id from prefixed input id ([00781da](https://github.com/Mearman/schema-components/commit/00781dad65c2c8142cfd6ed2e7af9a2894db0608))
* **html:** drop invalid aria-readonly from non-widget elements ([5185d4e](https://github.com/Mearman/schema-components/commit/5185d4ef4df8229d8158275d38a9edf3f899e96a))
* **html:** emit aria-selected=false on inactive discriminated-union tabs ([c334770](https://github.com/Mearman/schema-components/commit/c334770689b745ed6e7ac63b1b0b55f1978d17fd))
* **html:** set aria-orientation=horizontal on discriminated-union tablist ([88df1d7](https://github.com/Mearman/schema-components/commit/88df1d701606bcf3c38d225be7e4f764c6dd81d4))
* **openapi:** guard anchor href values via isSafeHyperlink ([ba35b8d](https://github.com/Mearman/schema-components/commit/ba35b8dce611a3cf05361f86a001663a1804a27b))
* **react:** add add/remove controls to editable array renderer ([bf77479](https://github.com/Mearman/schema-components/commit/bf77479cfcdd623515fd1d78777bef4cd89d1ae2))
* **react:** drop aria-label for non-string descriptions ([fd81405](https://github.com/Mearman/schema-components/commit/fd814054e6a52f0c12416b36af725893248d5605))
* **react:** emit aria-describedby + hint, fall back to key for object labels ([678979a](https://github.com/Mearman/schema-components/commit/678979aabea89577ad95d996c54905ab70ab5e30))
* **react:** exhaust WalkedField variants in defaultRecordValue ([ff2c945](https://github.com/Mearman/schema-components/commit/ff2c945d0aab9e908dad8dc03934d42b39e2fe24))
* **react:** refuse prototype-polluting path segments in fieldPath ([768c715](https://github.com/Mearman/schema-components/commit/768c7155ed7a286a2f4321ccee9ceff5e622b665))
* **themes:** wire discriminatedUnion fallback in shadcn resolver ([07d23b5](https://github.com/Mearman/schema-components/commit/07d23b53466b1feb0a8f09c2bb10534a166dffe2))

### Refactoring

* **core:** extract schema-input value-type inference into core/ ([d60094d](https://github.com/Mearman/schema-components/commit/d60094dd839babf8703f63877150561f651d7048))
* **core:** move WidgetMap into core/renderer ([0eaa822](https://github.com/Mearman/schema-components/commit/0eaa822288295d11bb30a87b69b7e37c1509e9f5))
* **core:** remove dead `recursive` resolver key ([410e29c](https://github.com/Mearman/schema-components/commit/410e29c60ae18d17b823bcc0d9879d43e58c2da4))
* **core:** remove dead `SchemaInput` type alias ([cb8cb72](https://github.com/Mearman/schema-components/commit/cb8cb7258d44ba0c42ee08d138e9979798f2fffa))
* **core:** unify ref-chain hop cap on MAX_PATH_ITEM_REF_HOPS ([11e4181](https://github.com/Mearman/schema-components/commit/11e41818dd673a1252bef82ff4ad9c41c2f581b2))
* **html:** collapse `fieldId`/`panelId`/`tabId` wrappers ([d2593f6](https://github.com/Mearman/schema-components/commit/d2593f6e1057901cc491cd8fad944a0d83d650ab))
* **openapi:** drop `*FromParsed` resolver variants ([0912b28](https://github.com/Mearman/schema-components/commit/0912b2818061310cc2dbfddf1a8a07293dde1ab5))
* **openapi:** refer to named parser types in `resolve` signatures ([1802e0c](https://github.com/Mearman/schema-components/commit/1802e0c7dd51e5d2da98e74fb4ceca8c11431571))
* **openapi:** rename parser `getX` to `extractX` ([53f1a68](https://github.com/Mearman/schema-components/commit/53f1a68c28930782a600fc22682f431e3f5c3d9e))
* **react:** remove half-implemented `path` prop on `SchemaComponent` ([aa0409b](https://github.com/Mearman/schema-components/commit/aa0409b0ec4d59ac1ad16c5fa19d1a39210dafb4))
* **themes:** replace register*Components mutables with createXResolver factories ([4f10bf9](https://github.com/Mearman/schema-components/commit/4f10bf90caac19225b74640472cc25895773b30e))

### Documentation

* **core:** silence TypeDoc warning on detectDiscriminated JSDoc ([980ab07](https://github.com/Mearman/schema-components/commit/980ab07a739792055aa0c7e00032d75e31a2da92))
* **core:** warn ExternalResolver and BundleResolver consumers about SSRF ([85e79e2](https://github.com/Mearman/schema-components/commit/85e79e27dee749a2ad3d42900baa98f949ae40c4))
* **react:** clarify accessibility doc — remove unimplemented aria-invalid claim ([9d93929](https://github.com/Mearman/schema-components/commit/9d93929aa761aba7c580053a139b2aa04dd2b0cd))
* rebuild README inventory after all six fix-agent integrations ([220c207](https://github.com/Mearman/schema-components/commit/220c20783a6f58c416b83148d355ddaf78778288))
* rebuild README inventory after W3+W4 integration ([dcf2c15](https://github.com/Mearman/schema-components/commit/dcf2c158bf256a43f5a5bcb43b8da0635a6390d4))

### Tests

* **core:** add layer-boundary contract test for cross-sibling imports ([7346364](https://github.com/Mearman/schema-components/commit/7346364019e1b88d1df17f909b039e7896669178))
* **core:** cover Swagger 2.0 path-level parameter normalisation ([3883fb7](https://github.com/Mearman/schema-components/commit/3883fb7a63d0412db32b4ce97ed72f874c7dd6af))
* **core:** direct unit coverage for displayJsonValue, matchUnionOption, resolveDiscriminatedActive ([5e82746](https://github.com/Mearman/schema-components/commit/5e827468e8410e50fa3c6133cca42eba6a56b080))
* **core:** include isInteger field in unionMatch test fixtures ([afb2df1](https://github.com/Mearman/schema-components/commit/afb2df1cda2b04d847900e21edf85dac38c506b6))
* **core:** pin empty enum diagnostic behaviour ([94265f2](https://github.com/Mearman/schema-components/commit/94265f2f18f76788f170c58b4fad97efa75b4d15))
* **html:** cover streaming resolver errors ([cc87509](https://github.com/Mearman/schema-components/commit/cc87509214bb79a7a8ab6b5e55e016555422b2c7))
* **react:** isolate registerWidget global state between tests ([7340aef](https://github.com/Mearman/schema-components/commit/7340aefd7d6881e5648efb4a714a74de11c24719))

### Chores

* **ci:** add eslint-plugin-import no-restricted-paths layer boundaries ([f57dee8](https://github.com/Mearman/schema-components/commit/f57dee8ee6c941b618a64c20d923c69bfe79f0f9))
* **ci:** add eslint-plugin-jsx-a11y recommended config for TSX ([efd38cd](https://github.com/Mearman/schema-components/commit/efd38cd8c42ef3daa6c2621857980608acec7e4f))
* **ci:** add eslint-plugin-no-only-tests for staged test files ([8ad4f5c](https://github.com/Mearman/schema-components/commit/8ad4f5cc80617df8e61fd944ac8eca400c5864bb))
* **ci:** enable @typescript-eslint/switch-exhaustiveness-check ([37ae348](https://github.com/Mearman/schema-components/commit/37ae34876d86523e43d7b118fac827d1e8530535))

## [1.29.0](https://github.com/Mearman/schema-components/compare/v1.28.2...v1.29.0) (2026-05-18)

### Features

* **core:** add mermaid and Material themed TypeDoc plugins ([b9a6767](https://github.com/Mearman/schema-components/commit/b9a6767f8e1d38f46fcb951d9cbf82013be60258))
* **core:** generate api-urls map from TypeDoc for Storybook badge ([df0029c](https://github.com/Mearman/schema-components/commit/df0029cc8f4d25a1351726348569246c017fc26f))
* **docs:** add per-story API reference badge to Storybook DocsPage ([926d0e8](https://github.com/Mearman/schema-components/commit/926d0e8cc793ac03c829ba780c41dc7cc7df4bed))

### Bug Fixes

* **build:** include function signature comments in API inventory ([e8cb6ca](https://github.com/Mearman/schema-components/commit/e8cb6ca3251ba0b4da6320c99d1acfea7528e423))
* **build:** resolve re-export targets when building API inventory summaries ([550ced1](https://github.com/Mearman/schema-components/commit/550ced1a6783f22c56ac26a5fa893561f0d078ff))
* **core:** scope story title extraction to meta object ([a58247e](https://github.com/Mearman/schema-components/commit/a58247e1e628cfc98e37e1476d4990c8c79f07fa))

### Documentation

* backfill summaries on remaining undocumented public exports ([351ffa7](https://github.com/Mearman/schema-components/commit/351ffa708327b930c84ddacb636905291d8ee7e3))
* **core:** add summaries and group tags to walker, adapter, diagnostics, errors ([d2d97da](https://github.com/Mearman/schema-components/commit/d2d97da48aaf36089cb99ae6b192cef0be432a8c))
* **core:** document type guards, constraint extractors, renderer types, and parser ([cd711e4](https://github.com/Mearman/schema-components/commit/cd711e42ae99cb18ab3a7672b1036d24da64eaa2))
* **openapi:** annotate OpenAPI component entry points with summaries and group tags ([8eaf359](https://github.com/Mearman/schema-components/commit/8eaf359c8a4b2ad2ed872d109b40b436e8e9cb16))
* **react:** add JSDoc summaries, group tags, and examples to React entry points ([4481e4e](https://github.com/Mearman/schema-components/commit/4481e4e15f81bfdd426dd3fc29aa00dee217b0cb))
* rebuild README inventory after parser fix and story tagging ([adab6a7](https://github.com/Mearman/schema-components/commit/adab6a7089a7b3e08a1e94829647923655fd6d1e))
* tag JSON Schema and Inputs stories with apiSymbols ([1c8c337](https://github.com/Mearman/schema-components/commit/1c8c3373fdec0c95f5a66f7a8f1a384857ff5b59))
* tag OpenAPI stories with apiSymbols ([bc8bc6b](https://github.com/Mearman/schema-components/commit/bc8bc6b6db4646506a35bb40e4d5d0f21b9c4a72))
* tag remaining React component stories with apiSymbols ([d2b6e4c](https://github.com/Mearman/schema-components/commit/d2b6e4c83ff4af6485d3b8075dbaccfdc7b51020))
* tag theme adapter and HTML rendering stories with apiSymbols ([523e669](https://github.com/Mearman/schema-components/commit/523e66935949722b5f63f3d29122d2c26d30f279))
* **themes:** annotate theme adapters and HTML renderers with summaries and examples ([204e3e3](https://github.com/Mearman/schema-components/commit/204e3e387c75657996a140de3ab2af25cfc4965d))

## [1.28.2](https://github.com/Mearman/schema-components/compare/v1.28.1...v1.28.2) (2026-05-18)

### Bug Fixes

* **core:** correct doubled packages/core prefix in TypeDoc source links ([5189583](https://github.com/Mearman/schema-components/commit/518958310a354448ec62364ccbbc3a6ff5015815))

## [1.28.1](https://github.com/Mearman/schema-components/compare/v1.28.0...v1.28.1) (2026-05-18)

### Documentation

* **core:** rewrite [@link](https://github.com/link) to internal helpers as code references ([c306837](https://github.com/Mearman/schema-components/commit/c30683715b138f4811ecc991adb6caac95b9e959))

### Chores

* **core:** silence remaining TypeDoc warnings ([9b7ef5f](https://github.com/Mearman/schema-components/commit/9b7ef5fa5f6cfa1e550a5e3e916444d0b6eb6c35))

## [1.28.0](https://github.com/Mearman/schema-components/compare/v1.27.0...v1.28.0) (2026-05-18)

### Features

* **core:** cross-link Storybook stories in README API inventory ([bc00759](https://github.com/Mearman/schema-components/commit/bc00759734529b9e30ab6f17757f7491b3b93b04))
* **docs:** add API reference toolbar link to Storybook manager ([f1f458c](https://github.com/Mearman/schema-components/commit/f1f458cb67084480552d77493ac7402f938a5fb7))

## [1.27.0](https://github.com/Mearman/schema-components/compare/v1.26.1...v1.27.0) (2026-05-18)

### Features

* **core:** add README API inventory generator from TypeDoc JSON ([c2376bc](https://github.com/Mearman/schema-components/commit/c2376bc4ba61f19a52f697c220c0ebdc669b3c67))

### CI

* gate PRs on README API inventory being up to date ([9a060e4](https://github.com/Mearman/schema-components/commit/9a060e482023397ff42c9b1e251ca9f9ae9b3610))

### Chores

* **ci:** regenerate README API inventory in pre-commit hook ([e2a5e3a](https://github.com/Mearman/schema-components/commit/e2a5e3aae51112044f78370774d407b07a27b243))

## [1.26.1](https://github.com/Mearman/schema-components/compare/v1.26.0...v1.26.1) (2026-05-18)

### Bug Fixes

* **ci:** rename docs script to typedoc to avoid pnpm built-in shadow ([6dca764](https://github.com/Mearman/schema-components/commit/6dca76481009b4dc2b2cf27205d11d828c4c1c07))

## [1.26.0](https://github.com/Mearman/schema-components/compare/v1.25.0...v1.26.0) (2026-05-18)

### Features

* **core:** add TypeDoc API reference generation ([153dbb8](https://github.com/Mearman/schema-components/commit/153dbb84e90e298170fdde955cee33282140f25c))
* **docs:** allow Storybook sub-path deploy via STORYBOOK_BASE_PATH ([ae1db59](https://github.com/Mearman/schema-components/commit/ae1db59ae90ff8609f9d08493eac6742b5803d07))

### Bug Fixes

* **react:** replace unresolved [@link](https://github.com/link) in SchemaView JSDoc with prose ([7ae8c14](https://github.com/Mearman/schema-components/commit/7ae8c142184ddbf3085c644dd4e6e03347692174))

### Documentation

* link API reference and update Storybook URL to sub-path ([64d3fde](https://github.com/Mearman/schema-components/commit/64d3fde7635c89152e23ba462c4b694e563a1309))

### CI

* unify TypeDoc and Storybook deploy to GitHub Pages ([eea4b73](https://github.com/Mearman/schema-components/commit/eea4b737200202bad76abc0340076d0efcfb38b4))

## [1.25.0](https://github.com/Mearman/schema-components/compare/v1.24.0...v1.25.0) (2026-05-18)

### Features

* **core:** thread io through normaliseSchema and normaliseZod4 ([6b366ec](https://github.com/Mearman/schema-components/commit/6b366ec86ffbffb6ad3500d55a727d6c55309b03))
* **react:** add io prop and retype value/onChange on SchemaComponent and SchemaView ([c64c887](https://github.com/Mearman/schema-components/commit/c64c887addebd7433aeed3a8cd06bd1fc751edee))

### Refactoring

* **core:** export isCodecSchema from adapter and reuse in SchemaComponent ([86f612c](https://github.com/Mearman/schema-components/commit/86f612cc612f7050d237a8fdbe419b89bf7b8fb2))

### Tests

* **react:** pin io prop rendering and validation contract ([51624f4](https://github.com/Mearman/schema-components/commit/51624f46315e66a7954f1a30e5b7a49404987e91))
* **react:** type io-direction codec fixture as unknown for compile-time access ([15040fa](https://github.com/Mearman/schema-components/commit/15040fa4d143482597188c0d5b74140ad8a35970))

### Chores

* **core:** drop round-7 prefix from io-direction test ([ad1ea64](https://github.com/Mearman/schema-components/commit/ad1ea644c7a20e5494d9dda011f88dc1bedc799b))

## [1.24.0](https://github.com/Mearman/schema-components/compare/v1.23.0...v1.24.0) (2026-05-18)

### Features

* **openapi:** dedicated ref-chain codes and cross-list duplicate detection ([2bfc4bc](https://github.com/Mearman/schema-components/commit/2bfc4bcf9f4afb964c71abc6a182a011fe2f61e5))

### Chores

* **core:** drop round-7 prefix from test filenames ([3ca7186](https://github.com/Mearman/schema-components/commit/3ca718621c583f5fd2bb94e5f4e48868890a7404))
* **core:** retire round-7 integration TODOs ([854ecbe](https://github.com/Mearman/schema-components/commit/854ecbee6652af0835e5d63817840f51b7ee6d77))

## [1.23.0](https://github.com/Mearman/schema-components/compare/v1.22.0...v1.23.0) (2026-05-18)

### Features

* **openapi:** emit duplicate-operation-id diagnostic from listOperations ([6cf7cee](https://github.com/Mearman/schema-components/commit/6cf7ceea9e86fde0cb488a30f4fc8872c61b4935))

### Bug Fixes

* **core:** collapse mergeAllOf incompatible type intersections to never ([a14a031](https://github.com/Mearman/schema-components/commit/a14a031aa8c4178d078d137293fcd51766f5c5fb))
* **core:** correct Swagger 2.0 collectionFormat conversion to OAS 3.x ([a9e8b95](https://github.com/Mearman/schema-components/commit/a9e8b9507fa8cb532a5582cd53375984cf3aed4d))
* **core:** emit swagger-malformed-oauth-flow for oauth2 missing flow ([0c5c0a3](https://github.com/Mearman/schema-components/commit/0c5c0a35f067d310359d1d408d8175789b96b93a))
* **core:** preserve explicit empty consumes in Swagger 2.0 body lift ([af87f61](https://github.com/Mearman/schema-components/commit/af87f61d5178aa49c661bd815efab8962452aeff))
* **core:** preserve non-primitive enum and const values per spec ([2eab3f7](https://github.com/Mearman/schema-components/commit/2eab3f74d0f9468c0a2d3e0083510168f6a1a6de))
* **core:** preserve ref siblings, dedup null branches, share example lift ([4758b45](https://github.com/Mearman/schema-components/commit/4758b45ebea2965d6b773ce21d78f0d568c23c43))
* **core:** resolve boolean $ref targets, percent-decode pointers, scope anchors ([dc176dc](https://github.com/Mearman/schema-components/commit/dc176dcc456c37100808eb17a9a4800ea582378c))
* **core:** return undefined for malformed OpenAPI version strings ([6da6266](https://github.com/Mearman/schema-components/commit/6da62661b2631c236cd2f37fae5a54c10a19581f))
* **core:** surface dependencies splits, honour per-schema $schema, defend tuple items ([9595497](https://github.com/Mearman/schema-components/commit/95954977c8a9f682db4f87d516deb0a989e39db5))
* **core:** walk boolean items/prefixItems, surface tuple unevaluatedItems ([62377c4](https://github.com/Mearman/schema-components/commit/62377c4ab0262eb3da7b57488688aafe24c9e8a2))
* **core:** widen Zod screen to handle nested promise/codec/preprocess/lazy ([638dee6](https://github.com/Mearman/schema-components/commit/638dee6b4bafe2357e560e9dff51c2949d79069d))
* **html:** yield via queueMicrotask in async streaming scheduler ([ec309ea](https://github.com/Mearman/schema-components/commit/ec309ea6c516ac7fb52bcacb79dd186499829e9b))
* **openapi:** cache normalisation once and replay diagnostics per sink ([308b3b0](https://github.com/Mearman/schema-components/commit/308b3b05b8ed6d51b3e9d687030743e7b2b6e32e))
* **openapi:** de-duplicate replayed diagnostics per sink identity ([052ef14](https://github.com/Mearman/schema-components/commit/052ef141776d15f9fb8eb701a8ffaab57ea62800))
* **openapi:** emit unknown-parameter-location and resolve Parameter $ref chains ([6e42404](https://github.com/Mearman/schema-components/commit/6e4240448e0b97f1c8e059577e7c7b2068b93246))
* **openapi:** include webhooks in PathKeysOf and widen MethodKeysOf<unknown> ([868ab2d](https://github.com/Mearman/schema-components/commit/868ab2ddc408c6ab03acc73066429c33e58bc857))
* **openapi:** match application/json with media-type parameters ([fe65ea0](https://github.com/Mearman/schema-components/commit/fe65ea0c36ebf32e50b36d007b87e656a85c71f8))
* **openapi:** merge Reference Object summary/description siblings on OAS 3.1 ([7db6e89](https://github.com/Mearman/schema-components/commit/7db6e8920fa115fc44db285060571d1e6e69f38e))
* **openapi:** multi-hop $ref for Header and Link Reference Objects ([538dc2c](https://github.com/Mearman/schema-components/commit/538dc2cc2f94573d40b495c2b9a430ed6e09844f))
* **openapi:** resolve callback Path Item $ref via listCallbacks ([dda37df](https://github.com/Mearman/schema-components/commit/dda37df146a476b81cdbef438353a14aca4d5019))
* **openapi:** resolve Path Item $ref on webhooks via listWebhooks ([f30c420](https://github.com/Mearman/schema-components/commit/f30c4200af1dd724adfb60df3a0860144714b4b2))
* **openapi:** surface path-webhook name collision in lookupPathItemNode ([9c10944](https://github.com/Mearman/schema-components/commit/9c109442b9ba69e7cf02c0a56c7739c8b403749b))
* **react:** gate Swagger 2.0 docs in SchemaComponent inference helpers ([8b6454c](https://github.com/Mearman/schema-components/commit/8b6454c56fa1b67a729b6f27e6a6bbfd654e7a68))
* **react:** single setNestedValue per change, add SchemaView generics ([455441e](https://github.com/Mearman/schema-components/commit/455441e4a962ee1d15f47ca56b13411ed13d432c))
* **react:** validate codec schemas via safeEncode against rendered output ([670af00](https://github.com/Mearman/schema-components/commit/670af00785840fd9ba070f0edc1847dc8db941c0))

### Refactoring

* **core:** add round-7 fix-cycle foundation modules ([911b73f](https://github.com/Mearman/schema-components/commit/911b73f15c0c8c727ce6b486587109af43a51034))
* **core:** adopt shared swagger2 helpers from foundation modules ([7873caa](https://github.com/Mearman/schema-components/commit/7873caa39b5375dcf1bffa593e01055fa5922b52))
* **core:** propagate widened enum/literal types to renderers ([d14a50a](https://github.com/Mearman/schema-components/commit/d14a50a5d7b3a43d11c78fe903d8ab5359a3b0ad))
* **core:** tighten SchemaRenderError schemaType to SchemaType union ([62d99ef](https://github.com/Mearman/schema-components/commit/62d99ef68e5369035edefc3c4cbda65fd2b85812))
* **core:** widen enum/literal values, add unevaluatedItemsClosed ([51fad39](https://github.com/Mearman/schema-components/commit/51fad392e3d5e0c853fb89c09eb56eb9f7411bf6))
* **html:** delegate a11y id helpers to core/idPath foundation ([0352350](https://github.com/Mearman/schema-components/commit/035235028598615765f6ce33e8d55353bceb2bb7))
* **html:** route streaming renderer through shared foundations and fix yieldOpen ([4829ac6](https://github.com/Mearman/schema-components/commit/4829ac6ff461b217d7f64c1ff57014134ba73d9b))
* **html:** route sync renderer ids and helpers through core foundations ([bb38725](https://github.com/Mearman/schema-components/commit/bb38725a0bd8baadc354211054b8ad90d27b2398))
* **openapi:** consolidate component imports and drop unsafeFields ([207418c](https://github.com/Mearman/schema-components/commit/207418c0a4dccb42067afa298125b7dc8820b529))
* **openapi:** delegate path-item ref chain to resolveRefChain ([b11a921](https://github.com/Mearman/schema-components/commit/b11a921b8dda90d8c98a4fff946f56271e049c13))
* **openapi:** use canonical documentContainsKeyword in resolve ([4fa562d](https://github.com/Mearman/schema-components/commit/4fa562d6f8ade07f97a9704f3a5c06b914e1550b))
* **openapi:** use shared HTTP_METHODS in parser ([1164e46](https://github.com/Mearman/schema-components/commit/1164e46ff54a14458edcda132951e9b426da2cc0))
* **react:** add a11y attribute helper mirroring html/a11y ([879d0f8](https://github.com/Mearman/schema-components/commit/879d0f85759f5523c2dcf365ff7cb19b60b7a84c))
* **react:** adopt core foundation modules in headless renderers ([fe4ff36](https://github.com/Mearman/schema-components/commit/fe4ff3668810a69f403c8595fe0f8e413b0e57fc))
* **react:** import canonical IsSwagger2Doc from typeInference ([45419b1](https://github.com/Mearman/schema-components/commit/45419b152a001b3babc8b714adf26d125ade40ce))

### Documentation

* **core:** align Zod 3 detection note with structural detector behaviour ([f6c3252](https://github.com/Mearman/schema-components/commit/f6c3252a30fdad6c8c37dc91ba18917d7c0d7957))

### Tests

* **core:** cover idPath helpers to meet coverage threshold ([8603070](https://github.com/Mearman/schema-components/commit/86030706cc8c69d3b5e47b689acb63f9e969485a))
* **core:** cover round 7 walker fixes for boolean schemas and rich consts ([ecfe7bc](https://github.com/Mearman/schema-components/commit/ecfe7bc8b9309429b9dd6024e12de9454334ab38))
* **core:** cover round-7 component runtime fixes ([0b34056](https://github.com/Mearman/schema-components/commit/0b34056fc69c252aafcea8991e22537246e14b2c))
* **core:** cover round-7 nested Zod construct screening and vendor errors ([590c92a](https://github.com/Mearman/schema-components/commit/590c92a4c64fcaa1587496443d1798a33a5378af))
* **core:** cover round-7 Swagger 2.0 normalisation fixes ([87c143a](https://github.com/Mearman/schema-components/commit/87c143adaf11919a52f117ca1c2b382b0d77e1e6))
* **html:** cover round-7 streaming-HTML fixes ([b09e72e](https://github.com/Mearman/schema-components/commit/b09e72ed6b57b73496f7238066350fb1b8a38493))
* **openapi:** cover round-7 parser fixes ([25d05fe](https://github.com/Mearman/schema-components/commit/25d05fea521a2d1721bf212bb686bbd62a0bdc89))
* **openapi:** cover round-7 resolve.ts fixes ([5ac1fc6](https://github.com/Mearman/schema-components/commit/5ac1fc6fc1afc7b58c06e7ef6a25d64cac23839a))
* **react:** pin the round-7 SchemaComponent / SchemaView regressions ([251595e](https://github.com/Mearman/schema-components/commit/251595e91c3e1aa3f52754f06342ae459ef156e0))

### Chores

* **ci:** mirror CI gates in pre-push hook ([f8521f0](https://github.com/Mearman/schema-components/commit/f8521f04f5fb47c63343f1b6f865b4ed40840c7d))

## [1.22.0](https://github.com/Mearman/schema-components/compare/v1.21.0...v1.22.0) (2026-05-17)

### Features

* **core:** add diagnostic codes for OpenAPI runtime fixes ([77d03c4](https://github.com/Mearman/schema-components/commit/77d03c459fa2e8d224aad20fe47f36e05f917908))
* **core:** add type-mismatch diagnostic code ([73165e3](https://github.com/Mearman/schema-components/commit/73165e3ad21eeefa74738c427e7905fd898f00e4))
* **core:** honour OpenAPI 3.1 jsonSchemaDialect for non-default drafts ([8dc21df](https://github.com/Mearman/schema-components/commit/8dc21df17a14511571f8b5e933b1010ad71416ce))
* **core:** surface dynamic-scope loss and 2019-09 dependencies split ([7162099](https://github.com/Mearman/schema-components/commit/7162099aa83832495993ff8ebdb634a6e24d46a1))
* **core:** surface examples and default in rootMeta ([819c2a2](https://github.com/Mearman/schema-components/commit/819c2a266005a2bebf5d8ce26f3e7dcd876ce976))
* **core:** surface unsupported OpenAPI/Swagger versions ([dbb5355](https://github.com/Mearman/schema-components/commit/dbb5355b2dab2381aee6806d5f8b57707adaae63))
* **core:** warn when \$id contains a non-empty fragment ([f02c2d6](https://github.com/Mearman/schema-components/commit/f02c2d6c29375c2178ddb317249073a432c10ad1))
* **core:** warn when contentSchema appears on a pre-2019-09 document ([5e728f7](https://github.com/Mearman/schema-components/commit/5e728f7f7a21aa49e279af7e27506cad5bee9bb3))
* **openapi:** add ApiWebhook and ApiWebhooks components ([6ef6e82](https://github.com/Mearman/schema-components/commit/6ef6e82e70825757879815b8990dd44dfdf0e713))
* **openapi:** diagnose unresolved cross-Schema-Object relative refs ([b2e8df5](https://github.com/Mearman/schema-components/commit/b2e8df5b3740f9342336adf65cae6870a63e5afa))
* **openapi:** emit dropped-feature diagnostic for OAS 3.x xml metadata ([e41caec](https://github.com/Mearman/schema-components/commit/e41caecf032e14abb936f91d5784cb8d2fef3aa5))
* **openapi:** surface externalDocs and schema-level xml metadata in renderers ([ce61da6](https://github.com/Mearman/schema-components/commit/ce61da603f94f1ad74659b8db8bccbafc4790112))
* **openapi:** validate security scheme types and flag unknown values ([32535f0](https://github.com/Mearman/schema-components/commit/32535f02e6b337fbf0bb34c695bbdac3aa068152))

### Bug Fixes

* **core:** broaden type inference to honour OpenAPI/JSON Schema semantics ([e4b918e](https://github.com/Mearman/schema-components/commit/e4b918e53e46e420f91c3614bc6d39f5b19321cf))
* **core:** bypass schema cache when diagnostics supplied ([f238d9f](https://github.com/Mearman/schema-components/commit/f238d9fca26bf4e589ba93e94cf3e09f409bbce5))
* **core:** classify non-Zod and half-constructed schemas explicitly ([503ef64](https://github.com/Mearman/schema-components/commit/503ef6471f658d2ae1086b5f36f7003ec15b7761))
* **core:** convert Swagger 2.0 non-formData file params to string/binary ([e36038d](https://github.com/Mearman/schema-components/commit/e36038df173d807969d97cc9460c389cc339fe92))
* **core:** drop main/types fields pointing at nonexistent dist/index files ([8d40c19](https://github.com/Mearman/schema-components/commit/8d40c1988911a3d1e4b1ccdc767a516bb069aa15))
* **core:** emit diagnostic and skip Swagger 2.0 cyclic parameter refs ([f0c2027](https://github.com/Mearman/schema-components/commit/f0c2027a8187c1ce5b55807bb5baecee0771b166))
* **core:** preserve nullable+enum/ref and discriminator extensions ([a92d6ab](https://github.com/Mearman/schema-components/commit/a92d6ab1d91c3709a83906b94b0051f541f60828))
* **core:** preserve Swagger 2.0 parameter and header constraint keywords ([a8d4b57](https://github.com/Mearman/schema-components/commit/a8d4b576521a44878170d380fe01e6b54da5f223))
* **core:** rewrite Parameter/Header example to spec-compliant examples map ([576af33](https://github.com/Mearman/schema-components/commit/576af33a8e55f1b36f1782a905bf4c63cb3d91fc))
* **core:** screen Zod schemas before conversion and pin toJSONSchema options ([72e10bf](https://github.com/Mearman/schema-components/commit/72e10bf6d58a100f111cf750b34a23a9eb436fc9))
* **core:** stop fabricating host/basePath for Swagger 2.0 server URLs ([62a7639](https://github.com/Mearman/schema-components/commit/62a7639576e019d59c47dd0782740bb67750f0c1))
* **core:** stop synthesising application/json for absent Swagger consumes/produces ([1299aea](https://github.com/Mearman/schema-components/commit/1299aea349605c28bbe5ee189f7d252bc9eb92f1))
* **core:** thread unevaluated keywords across allOf branches ([e0acab6](https://github.com/Mearman/schema-components/commit/e0acab6576c571ca476d7b332e00b769cedf36c9))
* **core:** translate Swagger 2.0 securityDefinitions to OAS 3.x shape ([1943eb7](https://github.com/Mearman/schema-components/commit/1943eb7643d60e67d8adee20c8141c27c53dbe55))
* **core:** trim and bound containsNestedZod3 walk ([fb2f037](https://github.com/Mearman/schema-components/commit/fb2f037f5b1359081f8a15b004f9e3e4c28517f7))
* **html:** escape labels in renderToHtml recursion sentinel ([8eaa955](https://github.com/Mearman/schema-components/commit/8eaa9552d8d948e20dbf4d8ba2d18510bfd9ffda))
* **html:** guard streaming renderer against cycles, mismatches, and unsafe ids ([7fe05ad](https://github.com/Mearman/schema-components/commit/7fe05ade80347d002af02f46359b116390bd3f98))
* **openapi:** narrow Api* path / method / status / contentType generics ([9517e1f](https://github.com/Mearman/schema-components/commit/9517e1f557d5bbf1da4926e0f27c240a033b8371))
* **openapi:** replace silent toDoc empty fallback with diagnostic ([e1e412e](https://github.com/Mearman/schema-components/commit/e1e412eed1318609475531115e0f25630fc69920))
* **openapi:** support multi-hop Path Item ref chains with cycle/depth diagnostics ([329d05a](https://github.com/Mearman/schema-components/commit/329d05ab659ff4b4432aa11720e7673a8914f560))
* **react:** expose typed value helpers and path generic on SchemaComponent ([0fd4052](https://github.com/Mearman/schema-components/commit/0fd405278c26cfd0e02df78d4c126fb2e28daa62))
* **react:** surface validation fallback failures via onError or host channel ([102d4bc](https://github.com/Mearman/schema-components/commit/102d4bce5431159ad9fd6fcaddb28347eabd0623))

### Refactoring

* **core:** consolidate depth caps into core/limits ([721fd69](https://github.com/Mearman/schema-components/commit/721fd692c966bc540996c77ce46fc37b299b7aa6))
* **core:** remove dead recursive field variant ([a1c95d3](https://github.com/Mearman/schema-components/commit/a1c95d378bc335a4a9623e56f7160b40b6aad2ba))
* **react:** drop unreachable try/catch in date/time formatters ([b9c0f1d](https://github.com/Mearman/schema-components/commit/b9c0f1d5c079b1403e2ad3248caf2ab2b4bc0adb))
* **react:** drop unused ROOT_PATH export from SchemaComponent ([524f5a3](https://github.com/Mearman/schema-components/commit/524f5a3c5e7af978be5ab1524fe1a7ba9ec1cb6a))

### Documentation

* **core:** pin classifier source references to message anchors ([e6a7ef7](https://github.com/Mearman/schema-components/commit/e6a7ef7cf0b9b6ce2f0c4ec3cc389c4e2ed32047))
* **core:** record format draft origins and permissiveness policy ([c8f007f](https://github.com/Mearman/schema-components/commit/c8f007f14ccae3009048822cfd818ea9f0804a5a))
* scope Zod 3 detection claim and de-duplicate JSON Schema node ([28cd97e](https://github.com/Mearman/schema-components/commit/28cd97ed0746f4b273781462d70ebc5e282800ff))

### Tests

* **core:** cover Draft 04 id rewrite scope in arbitrary JSON ([36af267](https://github.com/Mearman/schema-components/commit/36af267718a8b3b070dec9796986d7ba1184448f))
* **core:** cover z.iso.* formats in the round-trip matrix ([e8c31dd](https://github.com/Mearman/schema-components/commit/e8c31dd100166d47f235f23ba9c18b85b6a1d6d0))

## [1.21.0](https://github.com/Mearman/schema-components/compare/v1.20.0...v1.21.0) (2026-05-17)

### Features

* **core:** classify cycle/duplicate-id/conversion-bug Zod errors ([d7e8184](https://github.com/Mearman/schema-components/commit/d7e8184ac3dfd28aaaa3f9c4c24a7cc365a96921))
* **core:** walk contains schema as an array/tuple field ([e788ed1](https://github.com/Mearman/schema-components/commit/e788ed1e317aed9a5d458070bc30e5b70a03d03e))
* **openapi:** match application/*+json variants when selecting schema content ([3426006](https://github.com/Mearman/schema-components/commit/342600606308d289c707ba9656d79e25c969fa28))
* **openapi:** normalise discriminator on allOf-composite schemas ([b20c2e4](https://github.com/Mearman/schema-components/commit/b20c2e4942840d530bf68589b8f92e89196d2176))
* **openapi:** render OAuth flows, bearerFormat, scheme, and openIdConnectUrl in ApiSecurity ([176fbeb](https://github.com/Mearman/schema-components/commit/176fbebc13352e6aeea624f9055ba4f908be4563))
* **openapi:** thread diagnostics through getParsed and resolveOperation ([56f4b33](https://github.com/Mearman/schema-components/commit/56f4b33848b53329a21666e43c1068eaeea82b8f))

### Bug Fixes

* **core:** add cycle guards to recursive ref and schema walkers ([c18b9c9](https://github.com/Mearman/schema-components/commit/c18b9c9bfb8453385429f0b88d72440a1728e359))
* **core:** block prototype-pollution segments in canonical dereference ([266bf35](https://github.com/Mearman/schema-components/commit/266bf358306500a4f0c456af95896e11924cc702))
* **core:** broaden Swagger 2.0 detection in typeInference ([342c354](https://github.com/Mearman/schema-components/commit/342c354478fd8eb3405f8f697f2f882ae75c2bc9))
* **core:** extract defs at FromJSONSchema root for sibling-ref resolution ([d7ef27d](https://github.com/Mearman/schema-components/commit/d7ef27d0fa3840dd008db10b96007f686ad0b339))
* **core:** guard z.fromJSONSchema against round-trip failures ([44ce1a7](https://github.com/Mearman/schema-components/commit/44ce1a7e4025230ce8087758c0f22b95462ec533))
* **core:** handle boolean entries in allOf ([841ce1c](https://github.com/Mearman/schema-components/commit/841ce1c51be518c3f38f7a6865d332dab79a07ba))
* **core:** thread Depth through typeInference ref resolution ([d3b38ca](https://github.com/Mearman/schema-components/commit/d3b38caba782163a7308a538d16803d4b14b0c6e))
* **core:** translate Draft 06/07 tuple-form items to prefixItems ([079c1aa](https://github.com/Mearman/schema-components/commit/079c1aa665e20c79207e5105f8417a0b0e96a3a1))
* **core:** treat oneOf [T, null] as nullable like anyOf ([6587954](https://github.com/Mearman/schema-components/commit/65879542deb6b47baab26924da444b14a03e0759))
* **core:** unwrap Zod wrappers before rejecting unrepresentable types ([f30ddbd](https://github.com/Mearman/schema-components/commit/f30ddbd609f1bec1861b28cf10a6302ca4f6b89b))
* **core:** use native Error cause on schema-components errors ([afc6a3a](https://github.com/Mearman/schema-components/commit/afc6a3a8a8a06bb26a79c0f83fd1aa1d45c982c1))
* **core:** walk boolean sub-schemas at composite positions ([d412a54](https://github.com/Mearman/schema-components/commit/d412a54539722d16927d37a20bc99d9b4531ac9c))
* **openapi:** apply $id base-URI resolution to OpenAPI 3.1 schemas ([5d0a665](https://github.com/Mearman/schema-components/commit/5d0a665f34282ebc9463baf6afaa9958ec6282f3))
* **openapi:** block prototype-pollution segments in pathItem ref resolution ([a52b72b](https://github.com/Mearman/schema-components/commit/a52b72bcae75c103c6a1f68640fe0ee3b954d257))
* **openapi:** resolve $ref on response and requestBody objects ([692706e](https://github.com/Mearman/schema-components/commit/692706e8d460d50d97d55117c6ffce297f5581c2))

### Refactoring

* **core:** drop unused parentKey parameter from rewriteRelativeRefsValue ([e6f2390](https://github.com/Mearman/schema-components/commit/e6f2390c6e461572dd760eb5b1af24c5e6eca462))

### Tests

* **core:** avoid `as` assertion in cycle-safety test setup ([0568785](https://github.com/Mearman/schema-components/commit/05687858362e3730a0c060561f22aae9df14b5f9))

### Chores

* **core:** raise typeInference DEFAULT_MAX_DEPTH to match runtime ([a20af64](https://github.com/Mearman/schema-components/commit/a20af648dd0de2ee3ceef78fa9ce05876fd09e02))

## [1.20.0](https://github.com/Mearman/schema-components/compare/v1.19.0...v1.20.0) (2026-05-17)

### Features

* **core:** add format patterns for emoji, ulid, xid, ksuid, json-string, lowercase, uppercase, jwt ([597aa13](https://github.com/Mearman/schema-components/commit/597aa1304493e35d52d3be551bd259acd0408522))
* **core:** classify additional Zod 4 unrepresentable type errors ([f498d8a](https://github.com/Mearman/schema-components/commit/f498d8a00dbbc536b402b3cbf779258c8383942f))
* **core:** decode JSON Pointer escapes at the type level ([084ea74](https://github.com/Mearman/schema-components/commit/084ea74ce4e028262e51b433db41603de6f2c96e))
* **core:** detect Swagger 2.0 input in typeInference and fall back explicitly ([702d0de](https://github.com/Mearman/schema-components/commit/702d0deb59aa26a22f44cc01b6f0c017f15348a0))
* **core:** emit diagnostic for bare exclusiveMinimum/Maximum without sibling bound ([c399227](https://github.com/Mearman/schema-components/commit/c3992271bc331ecfe6cf5a85f587eeac67bd25eb))
* **core:** emit diagnostic when enum or required entries are filtered for type ([bc4885b](https://github.com/Mearman/schema-components/commit/bc4885bad8a2c5895641232d21be3b0d2597f804))
* **core:** handle Draft 04 tuple-form items in typeInference ([73ba147](https://github.com/Mearman/schema-components/commit/73ba1470b1bd9c7582185cc9f11e4b9cb24f73cd))
* **core:** mirror $recursiveAnchor true normalisation in typeInference ([a431abf](https://github.com/Mearman/schema-components/commit/a431abf27b05fa06010ea680b32c05223a247db8))
* **core:** preserve original Zod error as cause on SchemaNormalisationError ([ae6303f](https://github.com/Mearman/schema-components/commit/ae6303fbfa72925d8dc6f32197cc9097efa375b3))
* **core:** resolve #/components/schemas/ refs in ResolveSchemaRef ([4be0518](https://github.com/Mearman/schema-components/commit/4be05188a7d9a93d5c48caac639d0e2db1bfa62e))
* **core:** resolve nested \$ref against enclosing \$id base-URI ([b720f2d](https://github.com/Mearman/schema-components/commit/b720f2df8ef0e8cf0a0015bebdbf7fc8f5589bf9))
* **core:** statically reject unrepresentable Zod 4 types at the SchemaComponent props boundary ([0a5cf9f](https://github.com/Mearman/schema-components/commit/0a5cf9fa0313341bc8c3ef115c233c4b3eb84d19))
* **openapi:** detect and surface jsonSchemaDialect declarations ([8c20789](https://github.com/Mearman/schema-components/commit/8c20789d2bc37ba608ba66fd1e3fb91bd866f969))
* **openapi:** emit diagnostic for duplicate in:body parameters in Swagger 2.0 ([1721d76](https://github.com/Mearman/schema-components/commit/1721d76615c3757a9d3177650b7574651bc3ce57))
* **openapi:** render path-level summary and description above operation headers ([58bf403](https://github.com/Mearman/schema-components/commit/58bf403a3d58f9f7793fbc0061506545a5d690c9))

### Bug Fixes

* **core:** apply nullable at FromJSONSchema level in typeInference ([3031e6b](https://github.com/Mearman/schema-components/commit/3031e6b43f2ca2442bbfbe0ca9fd78a9bd5afc0d))
* **core:** guard pattern compilation against ReDoS and malformed input ([b5e1123](https://github.com/Mearman/schema-components/commit/b5e1123057522d1beab9fdd6652eaa85de45f5f9))
* **core:** skip prototype-polluting property names in walker ([35e9587](https://github.com/Mearman/schema-components/commit/35e95875413e49a3d5d06f79819f6b81bcd87b65))
* **core:** walk prefixItems items as TupleField rest schema ([5285bca](https://github.com/Mearman/schema-components/commit/5285bcadf726fbdb870a8bce0db88d437f716057))
* **html:** reject dangerous URI schemes in href and mailto outputs ([624ecaf](https://github.com/Mearman/schema-components/commit/624ecaff56e38ad6313f38ab7ae5bef8ef99cf3c))
* **openapi:** block prototype-pollution JSON Pointer segments in ref resolution ([ff4bc11](https://github.com/Mearman/schema-components/commit/ff4bc11a87c99ad627a17343404c922e1ca2935e))
* **openapi:** convert Media Type Object example to a single Example Object entry ([14fa5e5](https://github.com/Mearman/schema-components/commit/14fa5e5923a1b261ea6817a7c4eb3c5ee30cb820))
* **openapi:** convert Swagger 2.0 response-level headers to OpenAPI 3.x shape ([665b407](https://github.com/Mearman/schema-components/commit/665b407613fd4cf281c8694ef8a3b974cad1471b))
* **openapi:** include head, options, trace in resolveOpenApiRef regex ([c113869](https://github.com/Mearman/schema-components/commit/c113869619f72fb78c97748e5066279c4905e878))
* **openapi:** propagate getLinks exceptions instead of silently swallowing them ([14cc4a8](https://github.com/Mearman/schema-components/commit/14cc4a86c28ebeea226d2f8aa9fc6fd395976282))
* **openapi:** respect urlencoded consumes when mapping Swagger formData ([4ce3aab](https://github.com/Mearman/schema-components/commit/4ce3aab33902ddf8955f1503107cdd8acacba847))

### Refactoring

* **core:** cover unreachable branches by deletion and direct exports ([8233fdd](https://github.com/Mearman/schema-components/commit/8233fdd15412982681da487f55179361f92b4da9))
* **core:** remove unreachable RequestBodySchemaOf branch and fix __SchemaInferenceFellBack detection ([c9607e4](https://github.com/Mearman/schema-components/commit/c9607e4fb044a136527ad01974b4f149eb4e4082))

### Tests

* **core:** assert Zod error message contract for classifier prefixes ([1c9a0f6](https://github.com/Mearman/schema-components/commit/1c9a0f639cb8df0d85793a3e87cc5ba747ea1607))

## [1.19.0](https://github.com/Mearman/schema-components/compare/v1.18.1...v1.19.0) (2026-05-17)

### Features

* **core:** add format patterns for cuid, cuid2, nanoid, cidrv4, cidrv6, base64, base64url, e164 ([e8294bb](https://github.com/Mearman/schema-components/commit/e8294bbfa54dea1fc72914701eaaab31ef483e19))
* **core:** emit assumed-draft diagnostic for unknown $schema URIs ([cb09c19](https://github.com/Mearman/schema-components/commit/cb09c19b1599d3f0bc16e22c30b5906fdd1c0db1))
* **core:** thread diagnostics for legacy normalisation rewrites ([4d849e2](https://github.com/Mearman/schema-components/commit/4d849e2357ab22827fc7c11c4721978db377e017))
* **openapi:** emit diagnostic when Swagger XML metadata is dropped ([15a21f8](https://github.com/Mearman/schema-components/commit/15a21f8c1d7dad066cc2f08421cdab2e5d2eccb9))
* **openapi:** render operation description in ApiOperation header ([1b67c9b](https://github.com/Mearman/schema-components/commit/1b67c9b5de7d1242f055a431f11ce5ca450a6604))
* **react:** register renderers for conditional/negation/tuple/literal/null/never ([af61368](https://github.com/Mearman/schema-components/commit/af613685d5ae64ccc32262ce670b0b2b6e90c2e7))

### Bug Fixes

* **core:** classify Zod 4 conversion failures with SchemaNormalisationError ([653f1b5](https://github.com/Mearman/schema-components/commit/653f1b52c596cf0decdee962ad54e58100930602))
* **core:** preserve $recursiveRef value when normalising to $ref ([ab72d49](https://github.com/Mearman/schema-components/commit/ab72d492744173ff47c583352e1f8b5f65ca2739))
* **core:** throw SchemaNormalisationError directly from normaliseZod3 ([ec6f4e2](https://github.com/Mearman/schema-components/commit/ec6f4e267f9233914f087ad9feb031815d6566de))
* **openapi:** apply discriminator normalisation to OpenAPI 3.1 documents ([3b476a5](https://github.com/Mearman/schema-components/commit/3b476a5d3d26ef960108d4672cfc52921292f669))
* **openapi:** copy top-level security through Swagger 2.0 normalisation ([5359e03](https://github.com/Mearman/schema-components/commit/5359e031ef9dd387da1c725aabd655a198270080))
* **openapi:** deep-normalise Swagger 2.0 components.parameters and components.responses ([6a2756b](https://github.com/Mearman/schema-components/commit/6a2756bce9328d2553288e417ca90fc5301ee72e))
* **openapi:** include head, options, trace in parser METHODS ([351c5e7](https://github.com/Mearman/schema-components/commit/351c5e79f6ad449ac7eaee2e15cc77bf02e5b8e9))
* **openapi:** normalise OpenAPI 3.0 keywords in callbacks, links, headers and components/* ([ffaf8b0](https://github.com/Mearman/schema-components/commit/ffaf8b06537987b31ca803c0107e7553a69d60da))

## [1.18.1](https://github.com/Mearman/schema-components/compare/v1.18.0...v1.18.1) (2026-05-17)

### Bug Fixes

* **core:** guard deepEqual against cyclic values in mergeAllOf ([8f88349](https://github.com/Mearman/schema-components/commit/8f883494fa2b39012a17a52c85047ff080796e6b))
* **html:** sanitise discriminated union tab ids derived from props.path ([cd7040b](https://github.com/Mearman/schema-components/commit/cd7040b6cdc45ee38e7535bac88df4cf1e7b74ba))
* **openapi:** resolve $ref headers against document root ([25b962b](https://github.com/Mearman/schema-components/commit/25b962b69229e457ef3dc751a664c75bd932ec8e))
* **openapi:** surface missing security scheme type as undefined ([fa266a7](https://github.com/Mearman/schema-components/commit/fa266a72c9ed0eb91cfcc55fa39489adaef32ee3))
* **themes:** sort object fields by meta.order across all theme adapters ([b572f46](https://github.com/Mearman/schema-components/commit/b572f466b41efd217cb28e7e4712c6f878d10a7c))

### Refactoring

* **html:** remove unreachable renderFieldHtml fallback ([f8b22fd](https://github.com/Mearman/schema-components/commit/f8b22fd9ea1a5f29c5087c147cf61648bc352855))
* **openapi:** return early after rewriting $ref to skip sibling walk ([d6a5739](https://github.com/Mearman/schema-components/commit/d6a57396ce88f238edcb3dec105e8b1a39a7eadc))
* **react:** remove duplicate BaseFieldProps fields and read from tree ([04c20ac](https://github.com/Mearman/schema-components/commit/04c20ac8cc27e08b64470e590e0d4e81b89cdc82))

## [1.18.0](https://github.com/Mearman/schema-components/compare/v1.17.0...v1.18.0) (2026-05-17)

### Features

* **core:** emit diagnostics for conflicting allOf merges and inconsistent discriminators ([87bdb90](https://github.com/Mearman/schema-components/commit/87bdb905b0758e2229e991f39c85c97ac0cf2daa))

### Bug Fixes

* **html:** derive child paths structurally and render array children once ([76caa1f](https://github.com/Mearman/schema-components/commit/76caa1f0c372036d818d7cd91c8e14492db8b109))
* **openapi:** inline external refs into components.schemas with de-duplication ([1f60b90](https://github.com/Mearman/schema-components/commit/1f60b90d69fbc387193131f695c6441ba04af892))
* **openapi:** normalise OpenAPI 3.0 schemas in ApiOperation pipeline ([2959d23](https://github.com/Mearman/schema-components/commit/2959d23633428474b368ed9584c6573d416afd65))
* **openapi:** resolve $ref parameters against document root ([59d189f](https://github.com/Mearman/schema-components/commit/59d189f82ed725b7eddb329f20daa71b672d0ab7))
* **react:** wire ids on discriminated union tabs and stabilise handlers ([b91ee14](https://github.com/Mearman/schema-components/commit/b91ee140d0d1bfb938a733bd15c7d55f383aa66e))

### Refactoring

* **react:** extract shared buildRenderProps and read field data from tree ([f85a652](https://github.com/Mearman/schema-components/commit/f85a6524ca4acc101f249e17155e538199997e2d))

### Tests

* **core:** add typeInference walker parity tests and document depth bound ([9e6dca3](https://github.com/Mearman/schema-components/commit/9e6dca36ccdddf4c26f8eb03612c47f7391cf38a))

### Chores

* add pre-merge-commit hook to enforce linear history on main ([52410c9](https://github.com/Mearman/schema-components/commit/52410c9611d81024d121b0dd0b3650607f6570bf))

## [1.17.0](https://github.com/Mearman/schema-components/compare/v1.16.3...v1.17.0) (2026-05-17)

### Features

* **react:** activate WAI-ARIA tabs automatically on arrow key ([f1422f0](https://github.com/Mearman/schema-components/commit/f1422f03e06e18c27444fb2a44964aa129d00a59))
* **react:** unique per-instance id prefixes via useId ([5aa9d4a](https://github.com/Mearman/schema-components/commit/5aa9d4adf9dbc9c8e9cb84eaa486b89b52d1653b))

### Bug Fixes

* **react:** scope SchemaView and OpenAPI ids per instance via useId ([0edee2e](https://github.com/Mearman/schema-components/commit/0edee2e1ef1a6db4f9c8eb12679e79f92fe4bef1))
* **react:** thread unique path-derived ids through every field ([1b7a492](https://github.com/Mearman/schema-components/commit/1b7a49239e2049ea43d8f5089c718c24e8dc3270))
* **themes:** pair labels with inputs in MUI/Radix/shadcn adapters ([d891634](https://github.com/Mearman/schema-components/commit/d891634ebf7733e6d6477baa7d9a859969c16b69))
* **themes:** pair Mantine labels and render read-only scalars as Text ([1ed8f92](https://github.com/Mearman/schema-components/commit/1ed8f9270bb5ba78719c38359a92c3f19c60c167))

### Tests

* **docs:** assert Mantine read-only scalars render as Text ([f42868b](https://github.com/Mearman/schema-components/commit/f42868bf404f5372beaf91f4e093a129466b75d6))
* **docs:** upgrade adapter play functions to use label queries ([32a3147](https://github.com/Mearman/schema-components/commit/32a31471b6d63b7b17af09b27dc19895d0a57016))
* **react:** cover discriminated union tabs keyboard navigation in the DOM ([058b238](https://github.com/Mearman/schema-components/commit/058b23805ad9ed180c3ca692dba047552c395700))

### Chores

* **deps:** add happy-dom and testing-library for DOM-based React tests ([a54f681](https://github.com/Mearman/schema-components/commit/a54f681b275fbe15e82831dc64b491429c00be0a))
* **deps:** bump dependencies to latest age-window-compliant versions ([4f90f43](https://github.com/Mearman/schema-components/commit/4f90f435d7024b5ff2355dc1b2374654ed805c1e))
* **docs:** register Mantine Text with the adapter ([5361cae](https://github.com/Mearman/schema-components/commit/5361cae4853a59b344da6bc25651c1eb2f1b16f6))

## [1.16.3](https://github.com/Mearman/schema-components/compare/v1.16.2...v1.16.3) (2026-05-17)

### Bug Fixes

* **docs:** update Records play function for new record edit controls ([5684ec2](https://github.com/Mearman/schema-components/commit/5684ec203849fb650d7f652fcda69f0802afd9cd))

### Refactoring

* **docs:** convert Records stories to args-only CSF3 ([99b0b85](https://github.com/Mearman/schema-components/commit/99b0b851995101f48d4a716532e1057d8dd1e280))
* **docs:** convert SchemaDefaults stories to args-only CSF3 ([295de8a](https://github.com/Mearman/schema-components/commit/295de8aeb553e5c551c94173522a261ca23464db))
* **docs:** convert SchemaView stories to args-only CSF3 ([c2504d9](https://github.com/Mearman/schema-components/commit/c2504d9a86b7dca0adf3561e33fad68ef318905d))
* **docs:** convert single-story files to args-only CSF3 ([b692b20](https://github.com/Mearman/schema-components/commit/b692b2064f217220ba9aaab51b2e62742e332942))
* **docs:** convert VisibilityOrdering stories to args-only CSF3 ([de4d9aa](https://github.com/Mearman/schema-components/commit/de4d9aaa9cb1e6598d63301c9ff3f28c60d3b873))
* **docs:** convert Widgets stories to args-only CSF3 ([aaae3ce](https://github.com/Mearman/schema-components/commit/aaae3ce40271ea729346a204a417c34d062a42f7))
* **docs:** type bare Editability stories with explicit SchemaComponent meta ([756a4af](https://github.com/Mearman/schema-components/commit/756a4afe5d96975570495de522d82ed77d1628d9))
* **openapi:** convert callbacks/links stories to args-only ([1308171](https://github.com/Mearman/schema-components/commit/1308171110b0c241a3a96a623e73b747d5f690f4))
* **openapi:** convert OpenApiAdvanced SchemaComponent stories to args-only ([121b678](https://github.com/Mearman/schema-components/commit/121b6784bc996eacfb450fdd9a1a4869ce9c1408))

### Tests

* **docs:** add Mantine adapter interaction tests ([64c1d36](https://github.com/Mearman/schema-components/commit/64c1d361209e0bc60fe8f213d1bb3fd85d12bbbc))
* **docs:** add MUI adapter interaction tests ([765d4b1](https://github.com/Mearman/schema-components/commit/765d4b147c063d06a967de66cf696a5fc3ffa513))
* **docs:** add Radix Themes adapter interaction tests ([502e2cd](https://github.com/Mearman/schema-components/commit/502e2cd3c0aaa5c711bf62019c2d706cfad7383f))
* **docs:** add shadcn adapter interaction tests ([75c24d1](https://github.com/Mearman/schema-components/commit/75c24d1d3f9b0c35eb4a8f446b9006e789860069))
* **docs:** extend ThemeComparison cross-adapter assertions ([8317b11](https://github.com/Mearman/schema-components/commit/8317b11718ca89c684f88ca0459accbce9b52a9a))
* **react:** cover discriminated union ARIA tabs ([16437ff](https://github.com/Mearman/schema-components/commit/16437ff78f5d132397fcd7269a8dccb00564b17c))
* **react:** cover renderUnion edge cases ([ccb86da](https://github.com/Mearman/schema-components/commit/ccb86dae9e7a0cda015dbb7e61b013938fc65407))
* **react:** cover SchemaView server-component path ([b73ac93](https://github.com/Mearman/schema-components/commit/b73ac9375f25f7369a590cfcec8df1346064d9db))
* **react:** expand record renderer coverage and add edit controls ([274f5ac](https://github.com/Mearman/schema-components/commit/274f5ac3180a577eb8e282da5fa6abeffcf33581))

## [1.16.2](https://github.com/Mearman/schema-components/compare/v1.16.1...v1.16.2) (2026-05-17)

### Bug Fixes

* **docs:** sync MUI/Mantine/Radix/shadcn previews with theme toggle ([eae6d50](https://github.com/Mearman/schema-components/commit/eae6d5044632dda3b339faf8f782c760ffae8cda))

## [1.16.1](https://github.com/Mearman/schema-components/compare/v1.16.0...v1.16.1) (2026-05-17)

### Chores

* add pre-push hook running pnpm audit ([f5b6347](https://github.com/Mearman/schema-components/commit/f5b634759f1cb87dc40729782b5df62cc7296b41))

## [1.16.0](https://github.com/Mearman/schema-components/compare/v1.15.1...v1.16.0) (2026-05-17)

### Features

* **html:** theme HTML default styles via CSS custom properties ([e724e5c](https://github.com/Mearman/schema-components/commit/e724e5c00aa41e5e8d8192b6a2c639dd8b770f97))

### Bug Fixes

* **docs:** comprehensive dark-mode theming for storybook docs ([65d6c15](https://github.com/Mearman/schema-components/commit/65d6c15a273a2955329d51c908e520a78206b50e))

## [1.15.1](https://github.com/Mearman/schema-components/compare/v1.15.0...v1.15.1) (2026-05-17)

### Bug Fixes

* **react:** decode em-dash and ellipsis escapes in JSX text ([77f7ea1](https://github.com/Mearman/schema-components/commit/77f7ea1c7ccebc4a51ba3b6c382d03e09a07ca59))

## [1.15.0](https://github.com/Mearman/schema-components/compare/v1.14.0...v1.15.0) (2026-05-16)

### Features

* **docs:** add MdxMermaid helper for rendering diagrams in MDX pages ([6c0bfa9](https://github.com/Mearman/schema-components/commit/6c0bfa9dc8895b1938d38be70ad3169e3f3d8af1))
* **docs:** tag stories, expose argTypes, and cross-link related demos ([12a6d37](https://github.com/Mearman/schema-components/commit/12a6d37d5317abadc72002d955811ca9566927b9))

### Bug Fixes

* **docs:** import HtmlResolver from core/renderer ([cdc863f](https://github.com/Mearman/schema-components/commit/cdc863f3b1678c24bfa81821a9f8c5e5b126bf7d))
* **docs:** theme MDX content and argstable in dark mode ([fee2822](https://github.com/Mearman/schema-components/commit/fee2822d3b6172570676a0daa819c5fa6de5af88))

### Documentation

* **docs:** add Getting Started MDX page ([df3e643](https://github.com/Mearman/schema-components/commit/df3e6430878649b8b11eac8d3818a499177d956a))
* **docs:** add How it works MDX page ([0f2f77e](https://github.com/Mearman/schema-components/commit/0f2f77e4d6c11a60f2b8b8176b6d102c79d955b6))
* **html:** add HTML Rendering overview MDX page ([e06b54d](https://github.com/Mearman/schema-components/commit/e06b54d5f5a980beb19bedccdb2e81839db9b599))
* **openapi:** add OpenAPI walkthrough MDX page ([7936869](https://github.com/Mearman/schema-components/commit/79368691456a42a12e1074ccf3f4e18b89408b24))
* **themes:** add Theme Adapters overview MDX page ([ae486f3](https://github.com/Mearman/schema-components/commit/ae486f3ba5fa103789f4e6661b0fa7199db08c4d))

### Tests

* **docs:** add play functions, argTypes, and tags to interactive stories ([618dcdd](https://github.com/Mearman/schema-components/commit/618dcdd4806689cb83f8f60168dfb1d41f216727))

### Chores

* **docs:** add @storybook/addon-links ([45434fd](https://github.com/Mearman/schema-components/commit/45434fd3be948c0840a7d0328411e7f24585d63c))
* **docs:** include mdx files in stories glob ([f9fb4bc](https://github.com/Mearman/schema-components/commit/f9fb4bc22038447cb5882e3722bc7be2593e7fd4))

## [1.14.0](https://github.com/Mearman/schema-components/compare/v1.13.0...v1.14.0) (2026-05-16)

### Features

* **core:** add cycle marker for type-level $ref recursion ([b8d5408](https://github.com/Mearman/schema-components/commit/b8d54087b961e1abfc1c064ff8027c5a53e9e950))
* **core:** add diagnostics channel for surfacing silent fallbacks ([25d6c21](https://github.com/Mearman/schema-components/commit/25d6c215821857bc4fac28be1044ccb889f81c7a))
* **core:** add standard JSON Schema format patterns and validators ([ce071df](https://github.com/Mearman/schema-components/commit/ce071dfe0657a9074ee8f2c43b289af41ecf68cc))
* **core:** handle boolean schemas (true/false) at sub-schema positions ([9752fc8](https://github.com/Mearman/schema-components/commit/9752fc875b44532efd4eceef482063cd99a48ea5))
* **core:** infer JSON Schema draft from keywords when $schema absent ([53aac44](https://github.com/Mearman/schema-components/commit/53aac443b83bb1e64f61e1838958850c91257eff))
* **core:** map JSON Schema format to validation constraints ([53c8869](https://github.com/Mearman/schema-components/commit/53c8869d099d0983a69a96b78f84395bbe10ba73))
* **core:** merge annotation siblings of $ref per Draft 2020-12 ([b852db6](https://github.com/Mearman/schema-components/commit/b852db61c3ff1ed8295f3d0c16f0e855b044058d))
* **core:** split legacy dependencies into dependentRequired/Schemas ([24d80b1](https://github.com/Mearman/schema-components/commit/24d80b1b0b38f0d1a499bb118310518f3c994277))
* **core:** walk contentSchema for content-encoded string fields ([d4e635b](https://github.com/Mearman/schema-components/commit/d4e635b3544d09bda7430d8782c4797e7ea8b268))
* **core:** wire ExternalResolver through walker for inline external $ref ([8a0b8a5](https://github.com/Mearman/schema-components/commit/8a0b8a543522e7e1731f3e3fe223d0a60eb806b2))
* **openapi:** add multi-document $ref resolution via bundleOpenApiDoc ([47b0cd1](https://github.com/Mearman/schema-components/commit/47b0cd114b1a37d3427be6c202a093d58edd0510))
* **openapi:** render parsed-but-ignored security, callbacks, links, and headers ([3376ba8](https://github.com/Mearman/schema-components/commit/3376ba87e69792e4c4e075282500744ae2fc3f3d))

### Bug Fixes

* **openapi:** route OAS 3.0 documents through Draft 04 normalisation ([3dc87e1](https://github.com/Mearman/schema-components/commit/3dc87e1b801141a6498dccfdb1ec25935d67c126))
* resolve pre-existing type errors blocking pnpm check ([a6e5593](https://github.com/Mearman/schema-components/commit/a6e5593861629c3104557d26ceab244dfc53d20a))

### Refactoring

* **core:** derive $ref depth bound from document instead of literal ([fed94e4](https://github.com/Mearman/schema-components/commit/fed94e41e3e913f91ceb0c08af9bd0db4b2712d6))

### Documentation

* improve Zod 3 error message and document version requirement ([b8c30d0](https://github.com/Mearman/schema-components/commit/b8c30d054e9bd8cb6ee09da626d9b8b9b774fbb9))
* update spec-support tables to match verified compliance ([738448e](https://github.com/Mearman/schema-components/commit/738448efe117bc432283161dc03446a5855a88f6))

### Tests

* **core:** add inline conformance harness for JSON Schema drafts 04–2020-12 ([0a51eb2](https://github.com/Mearman/schema-components/commit/0a51eb2c821e760a0c6da5a4a8a4dd357f6df50e))
* **openapi:** cover parameter field overrides and meta merging ([58e59a7](https://github.com/Mearman/schema-components/commit/58e59a75e5c5d2d009576a0b0b739bc8f39970e7))
* **openapi:** walk real-world OpenAPI documents end-to-end ([b522fc5](https://github.com/Mearman/schema-components/commit/b522fc5420e6c56d9384740389f8fa0347f66027))

## [1.13.0](https://github.com/Mearman/schema-components/compare/v1.12.11...v1.13.0) (2026-05-16)

### Features

* **core:** add full JSON Schema keyword support with discriminated WalkedField types ([1a8fd3d](https://github.com/Mearman/schema-components/commit/1a8fd3df84c89b5ca4ad602ab4280c1b6faa4f64))
* **core:** add JSON Schema draft and OpenAPI version detection ([3861649](https://github.com/Mearman/schema-components/commit/386164978fdb4dbf40a93da47b14ecfd2d217b18))
* **core:** extract exclusiveMinimum/exclusiveMaximum constraints ([3d0063b](https://github.com/Mearman/schema-components/commit/3d0063bc8af402dbb63116312df2c4441a53106e))
* **core:** full type inference for all JSON Schema and OpenAPI versions ([c8c353e](https://github.com/Mearman/schema-components/commit/c8c353ec4998edbb682d94c22ea87b822f4953f5))
* **core:** full type inference for all JSON Schema keywords and OpenAPI versions ([eab2b59](https://github.com/Mearman/schema-components/commit/eab2b590fba8eb8249b89586227e9a5f978cfb65))
* **core:** normalise legacy JSON Schema and OpenAPI to Draft 2020-12 ([383b3ea](https://github.com/Mearman/schema-components/commit/383b3ea29f3b00f63721cb972b3bb365d442317f))
* **core:** type inference for additionalProperties, dependentSchemas, security types ([d80d5da](https://github.com/Mearman/schema-components/commit/d80d5dadbbe2cb31b431722816f6656e884822eb))
* **core:** walk patternProperties, dependentSchemas, dependentRequired, and unevaluatedProperties ([4c42f25](https://github.com/Mearman/schema-components/commit/4c42f252b36ef9b8e1f891c07153663d9a46353b))
* **core:** walk propertyNames, unevaluatedItems, and surface examples ([d46608d](https://github.com/Mearman/schema-components/commit/d46608dbcc9000fbe4d96a9cbe964f6df39b77d1))
* **openapi:** parse callbacks, links, externalDocs, and XML ([11a2fac](https://github.com/Mearman/schema-components/commit/11a2facc5c874acfd28ea83af1536276a4a5fcfb))
* **openapi:** parse security schemes, response headers, and webhooks ([51a3413](https://github.com/Mearman/schema-components/commit/51a34134a4fd94ed74f0a386825e867cd0800168))
* **openapi:** resolve pathItem $ref and webhook accessors ([7d6bfaa](https://github.com/Mearman/schema-components/commit/7d6bfaaa32c8535d748a81213ac6756227afe083))

### Bug Fixes

* **core:** prevent infinite recursion on circular schema references ([0afe155](https://github.com/Mearman/schema-components/commit/0afe155c58f4f5fe3b5b35be3b42bb034792fe09))
* **openapi:** rewrite $ref strings during Swagger 2.0 normalisation ([114fea4](https://github.com/Mearman/schema-components/commit/114fea424c6af7d7a9502fac1069572750f2c6f1))
* **openapi:** support JSON Pointer refs and rewrite Swagger 2.0 ref prefixes ([f67ae1a](https://github.com/Mearman/schema-components/commit/f67ae1a8df0b01fa4f7d8b4ae270db711fb6a643))

### Refactoring

* **core:** extract type-level inference into typeInference.ts ([a753fc4](https://github.com/Mearman/schema-components/commit/a753fc4de4cff62097095ccbfe0b774fc592e46d))
* **core:** extract walker building blocks into walkBuilders.ts ([0286cc0](https://github.com/Mearman/schema-components/commit/0286cc0112293fe570491dd902b6d203087f1114))
* **core:** split large modules into focused files ([d35a4bd](https://github.com/Mearman/schema-components/commit/d35a4bdd8a6d6bdfda91c00079a7ad7b54106fb9))
* **core:** split large test files under 800-line threshold ([9e6247f](https://github.com/Mearman/schema-components/commit/9e6247ff001c6f16e1546dbf05da88597d246388))
* **core:** split type-inference tests into focused modules ([39c88d2](https://github.com/Mearman/schema-components/commit/39c88d222a142aa340920888d39ead7ad698289a))

### Documentation

* add Draft 06 and Webhooks stories ([ddaafef](https://github.com/Mearman/schema-components/commit/ddaafefb72863abc3ee12e5da3c24bf6b320f066))
* add stories for all JSON Schema and OpenAPI features ([319c611](https://github.com/Mearman/schema-components/commit/319c611ea55ab8d5f89eee39276ebd93a353f5ba))
* **core:** add spec support keyword matrix and type-level fallback table ([0155059](https://github.com/Mearman/schema-components/commit/0155059ac9e50ceaeae5632ec234dc3cafbeb1f3))
* render mermaid diagrams in README story ([28612fd](https://github.com/Mearman/schema-components/commit/28612fde5bc8d078fbbb5adfa42f88406e5d427c))
* stories for advanced constraints, callbacks, links, examples ([6ab858c](https://github.com/Mearman/schema-components/commit/6ab858cc3f6ae50c768edd1221cfc981a454658e))

### Tests

* **core:** add extended draft-compat and full-compliance test suites ([9aa1004](https://github.com/Mearman/schema-components/commit/9aa100477c23275b4739336900a9e379b59c3004))
* **core:** circular $ref resolution — self-referencing, mutual, and depth limit ([e073cd1](https://github.com/Mearman/schema-components/commit/e073cd1bf3ef7c9a7af355a0735723e8b6a04acf))
* **core:** compile-time and runtime tests for all inference and walker gaps ([10a8c27](https://github.com/Mearman/schema-components/commit/10a8c27990d6ad837198128f4c262d6169a56ba9))
* **core:** comprehensive coverage for openapi30, parser, and type guards ([719576e](https://github.com/Mearman/schema-components/commit/719576e7455a980e1548acbe0cf63c386def9609))

### Chores

* add no-re-exports ESLint rule ([589176b](https://github.com/Mearman/schema-components/commit/589176b6063a88a1147688d117300ac5d1ffbcaa))

## [1.12.11](https://github.com/Mearman/schema-components/compare/v1.12.10...v1.12.11) (2026-05-15)

### Documentation

* replace ASCII diagrams in README with mermaid flowchart and remove directory tree ([dad43f3](https://github.com/Mearman/schema-components/commit/dad43f323d97a13d41e0554eb5d4fbe3b4508074))

## [1.12.10](https://github.com/Mearman/schema-components/compare/v1.12.9...v1.12.10) (2026-05-15)

### Bug Fixes

* respect system colour-scheme preference on initial load ([7e414ef](https://github.com/Mearman/schema-components/commit/7e414ef01f19e9f199882bb2ee484ea2a6272296))

## [1.12.9](https://github.com/Mearman/schema-components/compare/v1.12.8...v1.12.9) (2026-05-15)

### Bug Fixes

* detect system colour-scheme preference for Storybook theme ([255403a](https://github.com/Mearman/schema-components/commit/255403a1d9f9961f13677a1aa833e84f0c774923))

## [1.12.8](https://github.com/Mearman/schema-components/compare/v1.12.7...v1.12.8) (2026-05-15)

### Bug Fixes

* **docs:** resolve nested fieldset overflow and alignment issues ([4e25c73](https://github.com/Mearman/schema-components/commit/4e25c73d688ffd5785830a1786b9978b151fbb0e))

## [1.12.7](https://github.com/Mearman/schema-components/compare/v1.12.6...v1.12.7) (2026-05-15)

### Bug Fixes

* **core:** suppress empty Children in editable mode too ([5a5a3c3](https://github.com/Mearman/schema-components/commit/5a5a3c3a4c99ff586d2c6d2790a87793d3551351))

### Documentation

* split root and core READMEs ([2ebd3c7](https://github.com/Mearman/schema-components/commit/2ebd3c745bfd0d7d0bab49e3ff4a17a8d9a14a7e))

## [1.12.6](https://github.com/Mearman/schema-components/compare/v1.12.5...v1.12.6) (2026-05-15)

### Bug Fixes

* **core:** propagate resolver null returns through renderField ([e670437](https://github.com/Mearman/schema-components/commit/e6704379b6505211541cdaf51e434366b38aa281))

## [1.12.5](https://github.com/Mearman/schema-components/compare/v1.12.4...v1.12.5) (2026-05-15)

### Bug Fixes

* **core:** suppress empty Children sections on leaf nodes ([5f0bb25](https://github.com/Mearman/schema-components/commit/5f0bb25ffe10ec9a2c97db8ebefd534fc9536a20))

## [1.12.4](https://github.com/Mearman/schema-components/compare/v1.12.3...v1.12.4) (2026-05-15)

### Bug Fixes

* **core:** use ref cache for proper recursive schema cycles ([7d49f6e](https://github.com/Mearman/schema-components/commit/7d49f6e1a7c37fdc6ea1436b2ed3998b431d304e))

## [1.12.3](https://github.com/Mearman/schema-components/compare/v1.12.2...v1.12.3) (2026-05-15)

### Bug Fixes

* deduplicate README landing page to docs-only ([71d63c7](https://github.com/Mearman/schema-components/commit/71d63c73e154e46245a54edd1c605ba0995fc1b1))

## [1.12.2](https://github.com/Mearman/schema-components/compare/v1.12.1...v1.12.2) (2026-05-15)

### Bug Fixes

* **core:** resolve recursive $ref '#' to root document ([9ea6448](https://github.com/Mearman/schema-components/commit/9ea644815e3a10acc40569acf47de71d9eae712f))
* override Storybook autodocs backgrounds for dark theme ([f39aafd](https://github.com/Mearman/schema-components/commit/f39aafd802d6b3cdac7b3bfb5ea93bfb27903fd0))

## [1.12.1](https://github.com/Mearman/schema-components/compare/v1.12.0...v1.12.1) (2026-05-15)

### Bug Fixes

* add initialGlobals to seed theme state on docs page load ([d2c4911](https://github.com/Mearman/schema-components/commit/d2c49110fee949203ec6f923e123e15cbffe84f5))

## [1.12.0](https://github.com/Mearman/schema-components/compare/v1.11.0...v1.12.0) (2026-05-15)

### Features

* theme-aware docs background via @storybook/addon-themes ([4d2a5d8](https://github.com/Mearman/schema-components/commit/4d2a5d86c9f8e760abf3eab9b23ce65e0b8723eb))

## [1.11.0](https://github.com/Mearman/schema-components/compare/v1.10.10...v1.11.0) (2026-05-15)

### Features

* theme-aware docs with CSS custom properties and dark mode support ([8c02593](https://github.com/Mearman/schema-components/commit/8c02593720e0d9c2f467a894539d0acff43f5c34))

## [1.10.10](https://github.com/Mearman/schema-components/compare/v1.10.9...v1.10.10) (2026-05-15)

### Bug Fixes

* enable autodocs for all stories and fix blank docs page ([9a99323](https://github.com/Mearman/schema-components/commit/9a9932355ded92d038530833efad7286f9eabf55))

## [1.10.9](https://github.com/Mearman/schema-components/compare/v1.10.8...v1.10.9) (2026-05-15)

### Documentation

* show brand names in repo badges ([a8ae5a3](https://github.com/Mearman/schema-components/commit/a8ae5a36b19173c2d9386cda70766e60d79f3918))

## [1.10.8](https://github.com/Mearman/schema-components/compare/v1.10.7...v1.10.8) (2026-05-15)

### Documentation

* use logo-only GitHub and Storybook badges ([4808816](https://github.com/Mearman/schema-components/commit/48088169da213eb96091a1e79fd5ffd22d5bccb8))

## [1.10.7](https://github.com/Mearman/schema-components/compare/v1.10.6...v1.10.7) (2026-05-15)

### Documentation

* add GitHub repo badge ([7f470c6](https://github.com/Mearman/schema-components/commit/7f470c68b927b325eeeabd5b285f4d34f92d27bf))

## [1.10.6](https://github.com/Mearman/schema-components/compare/v1.10.5...v1.10.6) (2026-05-15)

### Documentation

* add Storybook badge ([f7fdfdd](https://github.com/Mearman/schema-components/commit/f7fdfdd4896971ee6a2c493edb8abaea7cee451b))

## [1.10.5](https://github.com/Mearman/schema-components/compare/v1.10.4...v1.10.5) (2026-05-15)

### Documentation

* add npm, license, and CI badges to README ([e9bef58](https://github.com/Mearman/schema-components/commit/e9bef58ef75822775b266da6e1e57596aa0de971))
* consolidate README — single source of truth via symlink ([3da376f](https://github.com/Mearman/schema-components/commit/3da376f2a47d9e52dc68000ebd7471a6e723ba63))

## [1.10.4](https://github.com/Mearman/schema-components/compare/v1.10.3...v1.10.4) (2026-05-15)

### Documentation

* add README landing page with syntax-highlighted code blocks ([a28addd](https://github.com/Mearman/schema-components/commit/a28addd9639412b9aa9c1d1a9efd86bfbaab4430))
* make README the Storybook landing page ([644bebc](https://github.com/Mearman/schema-components/commit/644bebced1dbc89fcc56cdaca7b211ce8f46f605))

## [1.10.3](https://github.com/Mearman/schema-components/compare/v1.10.2...v1.10.3) (2026-05-15)

### Documentation

* add README landing page and autodocs to Storybook ([dbab5ce](https://github.com/Mearman/schema-components/commit/dbab5ce2d3ccacd26793df125ae3d62dc301c00c))

## [1.10.2](https://github.com/Mearman/schema-components/compare/v1.10.1...v1.10.2) (2026-05-15)

### Bug Fixes

* **react:** render records in headless resolver ([d661106](https://github.com/Mearman/schema-components/commit/d6611065059ee08434e76cbbf7ae1881f48da74a))

### Documentation

* enable autodocs for all stories ([f8064e9](https://github.com/Mearman/schema-components/commit/f8064e9cbc99c5ce4d7bda8c592d36056465c486))

## [1.10.1](https://github.com/Mearman/schema-components/compare/v1.10.0...v1.10.1) (2026-05-15)

### Documentation

* restructure Storybook and add completeness demos ([8562562](https://github.com/Mearman/schema-components/commit/8562562e3b823c2f92daf386a0e90123e97edd2f))

## [1.10.0](https://github.com/Mearman/schema-components/compare/v1.9.1...v1.10.0) (2026-05-15)

### Features

* **core:** add Radix Themes adapter and Storybook demos ([749510f](https://github.com/Mearman/schema-components/commit/749510f28f0bc97b02dea775a975573777fd12c3))

## [1.9.1](https://github.com/Mearman/schema-components/compare/v1.9.0...v1.9.1) (2026-05-15)

### Bug Fixes

* **core:** replace component boundary suppressions with ElementType slots ([856d100](https://github.com/Mearman/schema-components/commit/856d100072b9506f2466fc7f295ddc1f54ecc3ed))

## [1.9.0](https://github.com/Mearman/schema-components/compare/v1.8.1...v1.9.0) (2026-05-15)

### Features

* **core:** add Mantine theme adapter and wire up real component libraries ([296608a](https://github.com/Mearman/schema-components/commit/296608a38c8102de7c88354988299a1808bc7d7a))

### Bug Fixes

* **core:** handle forwardRef objects in toComponent for real component libraries ([0275fc8](https://github.com/Mearman/schema-components/commit/0275fc8891006d1b0fe0ae8602a1c88ba363e45e))

## [1.8.1](https://github.com/Mearman/schema-components/compare/v1.8.0...v1.8.1) (2026-05-15)

### Bug Fixes

* **ci:** build core before storybook tests and fix static dir path ([1afd005](https://github.com/Mearman/schema-components/commit/1afd0051f4e7f598d4ed2073c4024c1a1afad6cf))
* **ci:** debug playwright browser path in Docker container ([b55b828](https://github.com/Mearman/schema-components/commit/b55b828018d18c1ed895bad7f1157473e54c9b42))
* **ci:** remove debug steps from storybook tests ([b3ef3e2](https://github.com/Mearman/schema-components/commit/b3ef3e2da0ef284c4dd5f002c0e4f75c1c445e14))
* **ci:** set PLAYWRIGHT_BROWSERS_PATH at step level for storybook tests ([c8d4bb6](https://github.com/Mearman/schema-components/commit/c8d4bb6841e7fc425cabd4d82c175446beb130e7))
* **ci:** set PLAYWRIGHT_BROWSERS_PATH for Docker container ([8ae43ef](https://github.com/Mearman/schema-components/commit/8ae43ef4d9933ee98052618bcc50f661f9327080))
* **ci:** use native playwright install instead of Docker container ([0de3948](https://github.com/Mearman/schema-components/commit/0de39487a3b4c177f4052bf647d6bfd20364e3c3))

### Refactoring

* convert to pnpm monorepo with packages/core and packages/docs ([3fd58c3](https://github.com/Mearman/schema-components/commit/3fd58c39da525995d0dea0786e1f3ec3cc20982d))

### Chores

* remove stale root tsdown and vitest configs ([86adf7b](https://github.com/Mearman/schema-components/commit/86adf7b15587d031054159395538e66272797b52))
* sync core package version to 1.8.0 ([315d302](https://github.com/Mearman/schema-components/commit/315d302905fab0dfe589f8d965759e1a39ab87b1))

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
