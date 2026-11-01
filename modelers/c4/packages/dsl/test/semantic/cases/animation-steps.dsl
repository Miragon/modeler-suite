workspace {
    model {
        a = element "A"
        b = element "B"
        c = element "C"
        a -> b
        shop = softwareSystem "Shop" {
            web = container "Web"
            db = container "Database"
        }
        web -> db
        live = deploymentEnvironment "Live" {
            deploymentNode "Server" {
                webInstance = containerInstance web
                dbInstance = containerInstance db
            }
        }
    }
    views {
        custom "Custom" {
            include *
            animation {
                a
                a->
                c
            }
        }
        container shop "Containers" {
            include *
            animation {
                web
                web->
            }
        }
        deployment shop live "Live" {
            include *
            animation {
                web
                webInstance->
            }
        }
    }
}
