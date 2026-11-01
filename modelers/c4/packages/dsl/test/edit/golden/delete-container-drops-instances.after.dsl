workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        live = deploymentEnvironment "Live" {
            server = deploymentNode "Server" {
                webInstance = containerInstance web
            }
            edge = deploymentNode "Edge" {
                proxy = infrastructureNode "Proxy"
            }
        }
    }
    views {
        container shop "Containers" {
            include *
            autoLayout tb 300 160
        }
        deployment shop live "Live" {
            include *
            animation {
                webInstance
                proxy
            }
        }
    }
}
