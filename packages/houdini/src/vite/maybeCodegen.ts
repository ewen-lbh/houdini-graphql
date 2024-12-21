import { Document, getConfig, loadLocalSchema, PluginConfig } from 'src/lib'

import codegen from '../codegen'
import { graphQLDocumentsChanged } from './documents'

/**
 * Run codegen if the file change resulted in a change in the extracted gql documents
 * @param extractedDocuments previously extracted documents - maps file paths to extracted graphql documents
 * @param absolutePath path t the file that changed
 * @param opts opts given to the vite plugin
 * @returns nothing
 */
export async function maybeCodegen(
	extractedDocuments: Record<string, Document[]>,
	absolutePath: string | null,
	opts?: PluginConfig
) {
	// load the config file
	const config = await getConfig(opts)
	if (config.localSchema) {
		// reload the schema
		config.schema = await loadLocalSchema(config)
	}

	// make sure we behave as if we're generating from inside the plugin (changes logging behavior)
	config.pluginMode = true

	if (opts?.autoCodeGen === 'smart' && absolutePath) {
		const previousDocuments = extractedDocuments[absolutePath] ?? []
		const [documentsChanged, documents] = await graphQLDocumentsChanged(
			config,
			absolutePath,
			previousDocuments
		)

		if (documentsChanged) {
			extractedDocuments[absolutePath] = documents
		} else {
			// early return, don't generate the runtime again
			return
		}
	}

	// generate the runtime
	await codegen(config)
}
