workspace {
    !identifiers hierarchical
    model {
        crm = softwareSystem "CRM"
        shop = softwareSystem "Shop" {
            web = container "Web"
            shop.web -> crm "Syncs customers"
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
