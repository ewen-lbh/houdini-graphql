import minimatch from 'minimatch'
import type { Plugin, ViteDevServer } from 'vite'
import { watchAndRun } from 'vite-plugin-watch-and-run'

import type { Document, PluginConfig } from '../lib'
import { formatErrors, getConfig, path } from '../lib'
import houdini_vite from './houdini'
import { maybeCodegen } from './maybeCodegen'
import { watch_local_schema, watch_remote_schema } from './schema'

export * from './ast'
export * from './houdini'
export * from './imports'
export * from './schema'

export default function (opts?: PluginConfig): Plugin[] {
	// we need some way for the graphql tag to detect that we are running on the server
	// so we don't get an error when importing.
	process.env.HOUDINI_PLUGIN = 'true'

	// default autoCodeGen is watch
	opts = { ...opts, autoCodeGen: opts?.autoCodeGen ?? 'watch' }

	// a container of a list
	const watchSchemaListref = { list: [] as string[] }

	const plugins = [
		houdini_vite(opts),
		watch_remote_schema(opts),
		watch_local_schema(watchSchemaListref),
	]

	// maps file paths to extracted graphql documents -- used to track document changes, see maybeCodegen
	const extractedDocuments: Record<string, Document[]> = {}

	switch (opts.autoCodeGen) {
		case 'startup':
			void maybeCodegen({}, null)
			break

		case 'watch':
		case 'smart':
			plugins.push({
				name: 'Houdini',
				...watchAndRun([
					{
						name: 'Houdini',
						async watchFile(filepath: string) {
							// load the config file
							const config = await getConfig(opts)

							// we need to watch some specific files
							if (config.localSchema) {
								const toWatch = watchSchemaListref.list
								if (toWatch.includes(filepath)) {
									// if it's a schema change, let's reload the config
									await getConfig({ ...opts, forceReload: true })
									return true
								}
							} else {
								const schemaPath = path.join(
									path.dirname(config.filepath),
									config.schemaPath!
								)
								if (minimatch(filepath, schemaPath)) {
									// if it's a schema change, let's reload the config
									await getConfig({ ...opts, forceReload: true })
									return true
								}
							}

							return config.includeFile(filepath, { root: process.cwd() })
						},
						async run(_server: ViteDevServer, path: string | null) {
							await maybeCodegen(extractedDocuments, path, opts)
						},
						delay: 100,
						watchKind: ['add', 'change', 'unlink'],
						formatErrors,
					},
				]),
			})
			break
	}

	return plugins
}
