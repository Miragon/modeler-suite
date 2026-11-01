workspace {
    model {
        shop = softwareSystem "Shop" {
            api = container "API"
        }
        live = deploymentEnvironment "Live" {
            servers = group "Servers" {
                server = deploymentNode "Server" {
                    proxy = infrastructureNode "Proxy"
                    apiInstance = containerInstance api
                }
            }
            forwards = proxy -> apiInstance "Forwards to"
        }
        !relationship forwards {
            tag "Proxied"
        }
    }
}
