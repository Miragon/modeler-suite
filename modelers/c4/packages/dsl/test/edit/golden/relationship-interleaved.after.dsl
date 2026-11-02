workspace {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Buys from"
        group "Partners" {
            bank = softwareSystem "Bank"
        }
        shop -> bank "Pays with"
        customer -> bank
        mail = softwareSystem "Mail"

        deploymentEnvironment "Live" {
            deploymentNode "Server" {
                softwareSystemInstance shop
            }
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
