workspace {
    model {
        partners = group "Partners" {
            bank = element "Bank"
        }
        shop = softwareSystem "Shop"
    }
    views {
        systemLandscape "Landscape" {
            include shop partners
        }
    }
}
